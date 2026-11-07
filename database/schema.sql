CREATE TABLE IF NOT EXISTS public.sensor_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  temperature NUMERIC(6,2) NOT NULL,
  threshold_value NUMERIC(6,2),
  -- Writer-supplied id so a retried write is recognised instead of duplicated.
  client_id TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sensor_readings_recorded_at_idx
  ON public.sensor_readings (recorded_at DESC);

-- Unique but nullable: rows written before client_id existed stay valid, and
-- Postgres allows many NULLs in a unique index.
CREATE UNIQUE INDEX IF NOT EXISTS sensor_readings_client_id_key
  ON public.sensor_readings (client_id);

CREATE TABLE IF NOT EXISTS public.threshold_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  value NUMERIC(6,2) NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS threshold_settings_created_at_idx
  ON public.threshold_settings (created_at DESC);
