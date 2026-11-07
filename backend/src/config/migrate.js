// Idempotent schema migration, run once at boot.
//
// The app's simulator writes alarm readings over the network, and a network
// write can fail *after* the database committed it — the caller then retries and
// the same alarm is recorded twice. Giving each reading a client-generated id
// makes the retry safe, because the unique index turns the second insert into a
// no-op instead of a duplicate row.
//
// `ADD COLUMN IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` make this safe to run
// on every start, and it is deliberately non-fatal: a database that is briefly
// unreachable must not stop the API from booting.
import { pool } from "./database.js";

export async function migrate() {
  const steps = [
    `ALTER TABLE public.sensor_readings
       ADD COLUMN IF NOT EXISTS client_id TEXT`,
    // Existing rows keep a NULL client_id, and Postgres allows many NULLs in a
    // unique index, so nothing that was written before this change is affected.
    `CREATE UNIQUE INDEX IF NOT EXISTS sensor_readings_client_id_key
       ON public.sensor_readings (client_id)`,
  ];

  for (const sql of steps) {
    try {
      await pool.query(sql);
    } catch (error) {
      console.error(`Migration step failed (continuing): ${error.message}`);
      return { ok: false, error: error.message };
    }
  }

  console.log("Schema up to date (sensor_readings.client_id)");
  return { ok: true };
}
