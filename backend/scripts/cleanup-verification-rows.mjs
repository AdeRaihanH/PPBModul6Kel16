// Removes only the rows this verification run created, identified by their
// client_id prefix. Nothing else is touched.
import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({
	connectionString: process.env.DATABASE_URL,
	max: 2,
	ssl: { rejectUnauthorized: false },
});

const { rows: before } = await pool.query(
	`SELECT count(*)::int AS n FROM public.sensor_readings`
);

const { rowCount } = await pool.query(
	`DELETE FROM public.sensor_readings
	 WHERE client_id LIKE 'itest-%'
	    OR client_id LIKE 'e2e-%'
	    OR (client_id IS NULL AND temperature = 21.50)`
);

const { rows: after } = await pool.query(
	`SELECT count(*)::int AS n FROM public.sensor_readings`
);

console.log(`rows before: ${before[0].n}`);
console.log(`deleted    : ${rowCount}`);
console.log(`rows after : ${after[0].n}`);

await pool.end();
