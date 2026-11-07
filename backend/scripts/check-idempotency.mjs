// Proves the write path is safe to retry, against the real API and database.
//
//   cd backend && node scripts/check-idempotency.mjs
//
// Writes a reading, writes it again with the same client_id (the "response was
// lost, so I retried" case), then checks the database holds it once. Cleans up
// after itself so it can be run repeatedly without polluting the alarm history.
const BASE = process.env.BACKEND_URL ?? "http://localhost:5002";

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
	if (ok) {
		pass++;
		console.log(`  ok   ${name}`);
	} else {
		fail++;
		console.log(`  FAIL ${name}${detail ? ` -> ${detail}` : ""}`);
	}
}

async function post(payload) {
	const res = await fetch(`${BASE}/api/readings`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});
	return { status: res.status, body: await res.json().catch(() => null) };
}

const clientId = `verify-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const payload = { client_id: clientId, temperature: 42.11, threshold_value: 30 };

console.log("POST the same reading twice (lost response + retry)");
const first = await post(payload);
const second = await post(payload);

check("first write is 201 Created", first.status === 201, `got ${first.status}`);
check("first is not a duplicate", first.body?.duplicate === false);
check("retry is 200 OK", second.status === 200, `got ${second.status}`);
check("retry is flagged duplicate", second.body?.duplicate === true);
check("both refer to the same row", first.body?.id === second.body?.id);
check("client_id round-trips", first.body?.client_id === clientId);

console.log("\nthe reading exists exactly once");
const list = await (await fetch(`${BASE}/api/readings`)).json();
const matches = list.filter((r) => r.client_id === clientId);
check("exactly one row", matches.length === 1, `${matches.length} rows`);

console.log("\nhealth endpoint");
const health = await (await fetch(`${BASE}/api/health`)).json();
check("status ok", health.status === "ok");
check("database reachable", health.db?.ok === true);
check("latency reported", typeof health.db?.latencyMs === "number");

console.log("\ninvalid input is still rejected");
const bad = await post({ client_id: `${clientId}-bad`, temperature: "warm" });
check("bad temperature is 400", bad.status === 400, `got ${bad.status}`);

console.log(`\n${pass} passed, ${fail} failed`);

// Self-cleaning: this script writes real rows, so it removes them again rather
// than leaving test alarms in the history.
try {
	const { default: pg } = await import("pg");
	const { default: dotenv } = await import("dotenv");
	dotenv.config({ quiet: true });
	const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
	const { rowCount } = await pool.query(
		`DELETE FROM public.sensor_readings WHERE client_id LIKE 'verify-%'`
	);
	await pool.end();
	console.log(`Cleaned up ${rowCount} verification row(s).`);
} catch (error) {
	console.warn(`Could not clean up (harmless): ${error.message}`);
}

process.exitCode = fail === 0 ? 0 : 1;
