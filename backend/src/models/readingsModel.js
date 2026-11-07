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

export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 500;

/**
 * Clamps a client-supplied time range.
 *
 * A range filter is useless without an upper bound on rows, and an unbounded
 * query would eventually drag the whole table onto a phone. Both ends are clamped
 * here rather than trusted from the query string.
 */
export function normalizeRange({ since, limit } = {}) {
  const parsedLimit = Number(limit);
  const safeLimit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(Math.floor(parsedLimit), MAX_LIMIT)
      : DEFAULT_LIMIT;

  let safeSince = null;
  if (typeof since === "string" && since.trim()) {
    const time = Date.parse(since);
    if (!Number.isNaN(time)) safeSince = new Date(time).toISOString();
  }

  return { since: safeSince, limit: safeLimit };
}

export const ReadingsModel = {
  async list(options = {}) {
    const { since, limit } = normalizeRange(options);
    const { rows } = await pool.query(
      `SELECT ${COLUMNS}
       FROM public.sensor_readings
       WHERE ($1::timestamptz IS NULL OR recorded_at >= $1)
       ORDER BY recorded_at DESC
       LIMIT $2`,
      [since, limit]
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
