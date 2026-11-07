import { pool } from "../config/database.js";
import { normalizeRange } from "./readingsModel.js";

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
}

export const ThresholdsModel = {
  async list(options = {}) {
    const { since, limit } = normalizeRange(options);
    const { rows } = await pool.query(
      `SELECT id, value, note, created_at
       FROM public.threshold_settings
       WHERE ($1::timestamptz IS NULL OR created_at >= $1)
       ORDER BY created_at DESC
       LIMIT $2`,
      [since, limit]
    );
    return rows.map(normalize);
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
