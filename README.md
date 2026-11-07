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

## Reliability

The pipeline had a real data-loss bug: the simulator wrote each alarm with a bare
`fetch` and moved on. If the backend happened to be restarting, that alarm was
gone — the one failure a monitoring system cannot afford.

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

**Errors are JSON everywhere.** Unknown routes, malformed bodies and unexpected
throws all answer `{ error }` instead of Express's HTML page, and the app unwraps
that field — otherwise a bad request would put `{"error":"…"}` (or a full HTML
document) into the error banner. Threshold values are bounded on the server
(`-50 … 100`) as well as in the input: an out-of-range threshold would make every
reading look safe and silently disable the alarm.

**The feed's own state is tracked.** The MQTT hook handles `close` and `offline`,
not just `error`, so a dropped socket turns the chip to Offline within a second
instead of claiming a live feed until the next reconnect attempt. It also starts
as `connecting`, because a red Offline chip before the first attempt reads as a
fault that is not there.

To prove it:

```bash
cd backend && node scripts/check-idempotency.mjs   # writes, retries, cleans up
```

## Dark mode

Both schemes are first-class: the light and dark palettes live in
`app/src/theme/tokens.js`, and every colour is read through `useTheme()`.

Three decisions worth knowing:

- **Styles are factories, not constants.** A `StyleSheet.create` at module scope
  freezes its colours at import time, so it can never follow a theme change. Each
  file now exposes `makeStyles(theme)` and consumes it with
  `useThemedStyles(makeStyles)`, which caches one sheet per (theme, factory) pair —
  so switching schemes rebuilds styles once, not on every render.
- **The header has one toggle.** It flips to the opposite of what is on screen and
  stops following the system from then on. The choice is stored in AsyncStorage
  under `livetemp.theme`; with nothing stored the app follows the OS setting
  (`userInterfaceStyle: "automatic"` in `app.json`).
- **Dark is not light inverted.** The dark palette uses desaturated tints and
  off-white text, because pure white on near-black haloes. Both palettes are
  checked for WCAG AA contrast (text 14:1 on surface in dark, buttons 5.8:1).

The theme checks also guard the failure mode that is easiest to miss: a token
defined in one palette and missing from the other, which renders as an undefined
colour in exactly one scheme.

## Thermal Guard

The base app is reactive: it shows the current temperature and records a reading
after the limit has already been crossed. Thermal Guard adds the two things a
reactive display cannot tell you — **how fast the reading is moving** and **how
much headroom is left**.

Everything runs on-device from the live MQTT stream.

### What it shows

| Tile | Meaning |
|---|---|
| **Rate** | °C per minute, measured from one reading to the next |
| **Margin** | How many degrees are left before the limit, or how far past it |
| **Peak** | Highest reading in the window |

The status pill summarises the whole panel:

| Pill | Condition |
|---|---|
| **Safe** | more than 1 °C below the limit |
| **Near limit** | within 1 °C of the limit |
| **Over limit** | at or above the limit |
| **No limit** | a live reading but no threshold configured |
| **Waiting** | no data yet |

Plus a live trace with the threshold as a dashed rule, and an anomaly banner when
a single reading jumps off the trend.

### Why there is no ETA

An earlier version extrapolated a crossing time from a fitted line. It was
removed deliberately, for two reasons found by testing it:

- On real sensor noise the fit was not confident enough to say anything, so the
  tile read `--` almost all the time — a feature that never fires.
- When it did fire it could count down to a crossing that would never happen,
  because a long-window fit keeps reporting a rise after the reading has turned
  around. A confident wrong number is worse than no number.

The panel now reports only what was measured. There is no projection line on the
chart for the same reason.

### Notifications

Crossing the limit fires one local notification, so a breach is not silent when
the phone is in your pocket. `app/src/lib/alarmTrigger.js` holds the policy as a
pure function: one per crossing, never repeated while the reading stays above the
limit, and a 60 s cooldown so a reading oscillating around the threshold cannot
produce a storm.

Honest limitation: the alert runs on the JS thread, so it fires while the app is
alive. Alerting with the app fully closed needs a server-side push, which requires
a development build (Expo Go cannot receive remote notifications on Android since
SDK 53). If notification permission is denied, the Monitoring screen says so
instead of failing silently.

### Alarm history filter

The history can be narrowed to the last 15 minutes, 1 hour, 6 hours, or all.
Filtering happens in the query (`?since=<ISO date>&limit=<n>`), not in the app, so
a long range does not drag the whole table onto the phone. Both ends are clamped
server-side: `limit` to 500, and an unparseable `since` falls back to no lower
bound rather than erroring.

### The statistics

`app/src/lib/thermalStats.js` — pure functions, no React, no native imports, so
the maths is testable in isolation.

- **Rolling window** of 48 samples (~4 min at the 5 s publish rate) for the chart.
- **Rate** is measured step by step: each value is the change from one reading to
  the next, and the result is the **median of the last three steps**. A single
  step is not used directly because at ±0.12 °C of sensor noise one sample swings
  the rate by ±1.4 °C/min, which would flicker between rising and falling while
  the reading is actually flat. The median rejects that without the lag of a long
  fit: a real reversal shows within two readings.
- **Proximity** compares the current reading with the threshold. The 1 °C "near"
  band is roughly one sensor step, so the warning arrives before the limit is
  crossed but late enough to mean something.
- **Anomaly**: residuals from a fitted line over the **long** window, then median
  absolute deviation (MAD), scaled by 1.4826 to compare against σ. Detrending
  first is the whole point — a healthy ramp is not an outlier, but a reading that
  jumps off the ramp is. MAD is used instead of a standard deviation because the
  outlier being hunted would otherwise inflate the very scale used to judge it.
  The long window matters too: over eight points a +11 °C spike drags the fitted
  line towards itself and scores a harmless 2.5σ; over 48 it scores about 9σ. A
  floor of 0.01 °C stops sensor resolution being read as a signal.

### Design notes

- The trace is drawn with Skia, which the app already used for the temperature
  orb, so the chart costs no extra dependency.
- Crossing the threshold fires one haptic per crossing, not one per sample, and
  motion is disabled under the system reduce-motion setting.
- The simulator defaults to a trend feed (24 → 32 °C, heating then cooling) so the
  panel has something to show; `npm start -- --random` restores the old
  independent-noise feed.

### Files

```
app/src/theme/tokens.js                 light and dark palettes
app/src/theme/ThemeProvider.js          scheme context, persistence, style cache
app/src/lib/thermalStats.js             rate, proximity, anomaly (pure)
app/src/lib/alarmTrigger.js             when to notify, and the wording (pure)
app/src/hooks/useLiveAnalytics.js       accumulates the MQTT feed, derives the view
app/src/hooks/useAlarmNotifications.js  one notification per crossing
app/src/hooks/useBackendHealth.js       polls /api/health
app/src/services/notifications.js       permission, Android channel, local alert
app/src/components/Sparkline.js         Skia trace with the limit rule
app/src/components/ThermalGuardCard.js  the panel
app/src/screens/MonitoringScreen.js     wires it to the live sensor
sensor-simulator/temperature.js         random and trend sample generators
sensor-simulator/alarmQueue.js          retrying outbox for alarm writes
```
