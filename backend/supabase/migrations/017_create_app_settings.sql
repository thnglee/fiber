CREATE TABLE IF NOT EXISTS app_settings (
  key    TEXT PRIMARY KEY,
  value  JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default routing config
INSERT INTO app_settings (key, value)
VALUES ('routing_config', '{"routing_mode":"forced","complexity_thresholds":{"short":400,"medium":1500}}')
ON CONFLICT (key) DO NOTHING;
