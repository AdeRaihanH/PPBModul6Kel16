import { pool } from "../config/database.js";

function normalize(row) {
  if (!row) return row;
  return {
    ...row,
    temperature: row.temperature === null ? null : Number(row.temperature),
    threshold_value:
      row.threshold_value === null ? null : Number(row.threshold_value),
  };
}

function assertValidTemperature(temperature) {
  if (
    typeof temperature !== "number" ||
    Number.isNaN(temperature) ||
    !Number.isFinite(temperature)
  ) {
    throw new Error("temperature must be a number");
  }
}

const COLUMNS = "id, temperature, threshold_value, client_id, recorded_at";

export const ReadingsModel = {
  async list() {
    const { rows } = await pool.query(
      `SELECT ${COLUMNS}
       FROM public.sensor_readings
       ORDER BY recorded_at DESC
       LIMIT 100`
    );
    return rows.map(normalize);
  },

  async latest() {
    const { rows } = await pool.query(
      `SELECT ${COLUMNS}
       FROM public.sensor_readings
       ORDER BY recorded_at DESC
       LIMIT 1`
    );
    return normalize(rows[0] ?? null);
  },

  /**
   * Insert a reading, safe to retry.
   *
   * The writer sends its own `client_id`. If a previous attempt already stored
   * this reading — for example the response was lost in transit — the conflict
   * is swallowed and the existing row is returned instead, so a retry can never
   * duplicate an alarm. Returns `{ reading, duplicate }` so the caller can say
   * which happened.
   */
  async create(payload) {
    const { temperature, threshold_value, client_id } = payload ?? {};
    assertValidTemperature(temperature);

    const clientId =
      typeof client_id === "string" && client_id.trim() ? client_id.trim() : null;

    const { rows } = await pool.query(
      `INSERT INTO public.sensor_readings (temperature, threshold_value, client_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (client_id) DO NOTHING
       RETURNING ${COLUMNS}`,
      [temperature, threshold_value ?? null, clientId]
    );

    if (rows.length > 0) {
      return { reading: normalize(rows[0]), duplicate: false };
    }

    // Only reachable when client_id collided, so the row is guaranteed to exist.
    const existing = await pool.query(
      `SELECT ${COLUMNS} FROM public.sensor_readings WHERE client_id = $1`,
      [clientId]
    );
    return { reading: normalize(existing.rows[0] ?? null), duplicate: true };
  },
};
