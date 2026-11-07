# PPB Modul 6 — LiveTemp

IoT temperature monitoring: a sensor publishes over MQTT, an Express API persists
threshold breaches to Postgres, and an Expo app renders the live feed.

```
sensor-simulator/  publishes temperature to MQTT every 5 s
backend/           Express + pg, port 5002, /api/readings and /api/thresholds
database/          schema.sql (sensor_readings, threshold_settings)
app/               Expo (React Native) client
firewall/          Windows helpers to open port 5002
```

## Running it

```bash
# 1. database — run database/schema.sql against your Postgres/Neon instance,
#    then put the connection string in backend/.env
cp backend/.env.example backend/.env

# 2. API
cd backend && npm install && npm run dev

# 3. sensor feed
cd sensor-simulator && npm install && npm start

# 4. app — set expo.extra.backendUrl in app/app.json to this machine's LAN IP
cd app && npm install && npx expo start
```

The phone and this machine must be on the same network. `backendUrl` is read
once at bundle time, so restart Metro with `npx expo start -c` after editing
`app.json`.

> `npm install` in `app/` runs `scripts/patch-expo-cli.js`, which fixes a Windows
> bug in `@expo/cli`: `npx expo login` opened the OAuth URL through
> `cmd.exe /c start`, and cmd truncates its command line at the first `&` — which
> an OAuth URL is full of. The patch launches the URL via
> `rundll32 url.dll,FileProtocolHandler` instead and keeps a failed browser
> launch from killing the CLI. Re-apply with `npm run patch:expo-cli`.

## Reliability (challenge feature)

The pipeline had a real data-loss bug: the simulator wrote each alarm with a bare
`fetch` and moved on. If the backend happened to be restarting, that alarm was
gone — the one failure a monitoring system cannot afford.

### What changed

**Nothing is dropped.** Writes go through an outbox
(`sensor-simulator/alarmQueue.js`) that retries with exponential backoff
(1 s → 2 s → 4 s, capped at 30 s) and only removes an item after a confirmed
write. Items are delivered in order, so alarms land in the order they happened.

**Nothing is duplicated.** Every reading carries a `client_id` minted once, when
the alarm is raised, and reused by every retry. The backend has a unique index on
that column and inserts with `ON CONFLICT (client_id) DO NOTHING`, returning the
existing row and `duplicate: true` when a write was already stored. This is what
makes retrying safe: a lost response is no longer a second alarm.

**The schema migrates itself.** `backend/src/config/migrate.js` runs
`ADD COLUMN IF NOT EXISTS` / `CREATE UNIQUE INDEX IF NOT EXISTS` at boot, so an
existing database needs no manual step. It is non-fatal: if the database is
unreachable the API still starts and reports the problem.

**The app stops lying about health.** `GET /api/health` reports database
reachability and query latency, and the Monitoring screen shows one line:
`Database ok · 12 ms`, `Database unavailable`, or `Backend unreachable`. A live
sensor feed with a dead database is not "working", and the UI now says so.

### Proving it

```bash
# 1. idempotency against the real database
node backend/scripts/check-idempotency.mjs

# 2. the outbox: retry policy, ordering, no double-send
#    (19 checks, fake clock and fake transport)

# 3. end to end: point the writer at a dead port, raise alarms, revive it
```

The end-to-end check queues three alarms while the backend is unreachable, drains
them when it returns, then resends the same three ids — and the database still
holds each one exactly once.

## Thermal Guard (challenge feature)

The base app is reactive: it shows the current temperature and records a reading
after the limit has already been crossed. Thermal Guard makes the same feed
**predictive** — it answers "when", not just "what".

Everything runs on-device from the live MQTT stream. No new dependencies, no
extra network calls, no server changes.

### What it shows

Three tiles, one line each:

| Tile | Meaning |
|---|---|
| **Rate** | °C per minute, from a least-squares fit over the rolling window |
| **ETA** | Time until the fitted trend reaches the threshold, counting down live |
| **Peak** | Highest reading in the window |

Plus a live trace with the threshold as a dashed rule, the projected crossing as
a dotted continuation, and an anomaly banner when a reading breaks the trend.

### Seeing the ETA work

The default simulator sends a slow ramp: 24 → 32 °C and back down, repeating.
Threshold 30 °C is crossed about a minute after start, so the ETA counts down,
flips to **Over**, then the feed cools and the status turns **Falling**.

```bash
cd sensor-simulator
npm start                 # trend feed (default)
npm start -- --random     # old independent-noise feed, no trend to project
```

With `--random` the ETA stays blank on purpose: there is no trend to extrapolate.

### The statistics

`app/src/lib/thermalStats.js` — pure functions, no React, no native imports, so
the math is testable in isolation.

- **Rolling window** of 48 samples (~4 min at the 5 s publish rate) for the chart
  and the window figures.
- **Rate and ETA use the last 8 samples** (~35 s), not the whole window. Fitting
  four minutes answers "what has this been doing", which keeps reporting a rise
  long after the sensor has turned around — raise 10 °C then drop 5 °C and the
  whole-window slope still reads positive. Eight samples follows the turn while
  still averaging out sensor noise.
- **Trend**: ordinary least squares on `(t, temperature)`. Time is normalised to
  seconds from the window start — fitting against raw epoch seconds would square
  numbers around 1e18 and lose the slope in float64 rounding.
- **Confidence**: R² of that fit. The ETA is withheld below R² 0.50, when there
  are fewer than 6 points, or when it projects beyond one hour. R² 0.30 sounds
  like a trend but over eight points is p ≈ 0.16, which random data clears about
  a third of the time; 0.50 is roughly p ≈ 0.05 and a real ramp sits near 0.99.
- **Anomaly**: residuals from the fitted line over the **long** window, then
  median absolute deviation (MAD), scaled by 1.4826 to compare against σ.
  Detrending first is the whole point — a healthy ramp is not an outlier, but a
  reading that jumps off the ramp is. MAD is used instead of a standard deviation
  because the outlier being hunted would otherwise inflate the very scale used to
  judge it. The long window matters too: over eight points a +11 °C spike drags
  the fitted line towards itself and scores a harmless 2.5σ; over 48 it is
  unmistakable. A floor of 0.01 °C stops sensor resolution being read as signal.

### Design notes

- The ETA ticks once a second while samples arrive every 5 s, so the number
  visibly counts down. That countdown lives in its own component — otherwise a
  one-second timer would re-render the whole screen.
- The trace is drawn with Skia, which the app already used for the temperature
  orb, so the chart costs no extra dependency.
- Crossing the threshold fires one notification haptic per crossing, not one per
  sample, and motion is disabled under the system reduce-motion setting.

### Files

```
app/src/lib/thermalStats.js          rolling-window statistics (pure)
app/src/hooks/useLiveAnalytics.js    accumulates the MQTT feed, derives the view
app/src/components/Sparkline.js      Skia trace, threshold rule, projection
app/src/components/ThermalGuardCard.js  the panel
app/src/screens/MonitoringScreen.js  wires it to the live sensor
sensor-simulator/temperature.js      random and trend sample generators
```
