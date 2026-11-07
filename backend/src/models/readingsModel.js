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

/**
 * Clamps a client-supplied time filter.
 *
 * A malformed `since` from the query string must not break the screen: anything
 * unparseable falls back to null (no lower bound) rather than erroring.
 */
export function normalizeSince({ since } = {}) {
  if (typeof since === "string" && since.trim()) {
    const time = Date.parse(since);
    if (!Number.isNaN(time)) return new Date(time).toISOString();
  }
  return null;
}

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

/**
 * Clamps a client-supplied page request.
 *
 * Same philosophy as the range filter: a page number from the query string is
 * untrusted input, so it is clamped here rather than trusted. Page 0, negatives,
 * and non-numbers all fall back to page 1; oversized page sizes are capped so a
 * single request can never drag the whole table onto a phone.
 */
export function normalizePagination({ page, pageSize } = {}) {
  const parsedSize = Number(pageSize);
  const safePageSize =
    Number.isFinite(parsedSize) && parsedSize > 0
      ? Math.min(Math.floor(parsedSize), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

  const parsedPage = Number(page);
  const safePage =
    Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1;

  return {
    page: safePage,
    pageSize: safePageSize,
    offset: (safePage - 1) * safePageSize,
  };
}

export const ReadingsModel = {
  async list(options = {}) {
    const since = normalizeSince(options);
    const { page, pageSize, offset } = normalizePagination(options);

    // The count walks the same filter as the page query, so totalPages can never
    // disagree with what the page query would have returned.
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM public.sensor_readings
       WHERE ($1::timestamptz IS NULL OR recorded_at >= $1)`,
      [since]
    );
    const total = countRows[0]?.total ?? 0;

    const { rows } = await pool.query(
      `SELECT ${COLUMNS}
       FROM public.sensor_readings
       WHERE ($1::timestamptz IS NULL OR recorded_at >= $1)
       ORDER BY recorded_at DESC
       LIMIT $2 OFFSET $3`,
      [since, pageSize, offset]
    );

    return {
      data: rows.map(normalize),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
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
