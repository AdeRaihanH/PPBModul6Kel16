import { pool } from "../config/database.js";
import { normalizeSince, normalizePagination } from "./readingsModel.js";

// Same bounds the app's input enforces (ControlScreen MIN/MAX_THRESHOLD). Kept in
// sync deliberately: the UI limit is a courtesy, this one is the rule.
export const MIN_VALUE = -50;
export const MAX_VALUE = 100;

function normalize(row) {
  if (!row) return row;
  return {
    ...row,
    value: row.value === null ? null : Number(row.value),
  };
}

function assertValidValue(value) {
  if (
    typeof value !== "number" ||
    Number.isNaN(value) ||
    !Number.isFinite(value)
  ) {
    throw new Error("value must be a number");
  }
  // The app already limits the input, but the API is the boundary that matters:
  // a threshold of 9999 would make every reading look safe forever, silently
  // disabling the alarm. Bounds are enforced here as well.
  if (value < MIN_VALUE || value > MAX_VALUE) {
    throw new Error(`value must be between ${MIN_VALUE} and ${MAX_VALUE}`);
  }
}

export const ThresholdsModel = {
  async list(options = {}) {
    const since = normalizeSince(options);
    const { page, pageSize, offset } = normalizePagination(options);

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM public.threshold_settings
       WHERE ($1::timestamptz IS NULL OR created_at >= $1)`,
      [since]
    );
    const total = countRows[0]?.total ?? 0;

    const { rows } = await pool.query(
      `SELECT id, value, note, created_at
       FROM public.threshold_settings
       WHERE ($1::timestamptz IS NULL OR created_at >= $1)
       ORDER BY created_at DESC
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
      `SELECT id, value, note, created_at
       FROM public.threshold_settings
       ORDER BY created_at DESC
       LIMIT 1`
    );
    return normalize(rows[0] ?? null);
  },

  async create(payload) {
    const { value, note } = payload ?? {};
    assertValidValue(value);

    const { rows } = await pool.query(
      `INSERT INTO public.threshold_settings (value, note)
       VALUES ($1, $2)
       RETURNING id, value, note, created_at`,
      [value, note?.slice(0, 180) ?? null]
    );
    return normalize(rows[0]);
  },
};
