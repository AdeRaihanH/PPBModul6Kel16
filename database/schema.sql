CREATE TABLE IF NOT EXISTS public.sensor_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  temperature NUMERIC(6,2) NOT NULL,
  threshold_value NUMERIC(6,2),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sensor_readings_recorded_at_idx
  ON public.sensor_readings (recorded_at DESC);

CREATE TABLE IF NOT EXISTS public.threshold_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  value NUMERIC(6,2) NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS threshold_settings_created_at_idx
  ON public.threshold_settings (created_at DESC);
