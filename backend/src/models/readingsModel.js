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

export const ReadingsModel = {
  async list() {
    const { rows } = await pool.query(
      `SELECT id, temperature, threshold_value, recorded_at
       FROM public.sensor_readings
       ORDER BY recorded_at DESC
       LIMIT 100`
    );
    return rows.map(normalize);
  },

  async latest() {
    const { rows } = await pool.query(
      `SELECT id, temperature, threshold_value, recorded_at
       FROM public.sensor_readings
       ORDER BY recorded_at DESC
       LIMIT 1`
    );
    return normalize(rows[0] ?? null);
  },

  async create(payload) {
    const { temperature, threshold_value } = payload ?? {};
    assertValidTemperature(temperature);

    const { rows } = await pool.query(
      `INSERT INTO public.sensor_readings (temperature, threshold_value)
       VALUES ($1, $2)
       RETURNING id, temperature, threshold_value, recorded_at`,
      [temperature, threshold_value ?? null]
    );
    return normalize(rows[0]);
  },
};
