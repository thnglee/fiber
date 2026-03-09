CREATE TABLE model_configurations (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW(),

  -- Identity
  provider                    TEXT NOT NULL,        -- 'openai' | 'gemini' | 'anthropic'
  model_name                  TEXT NOT NULL UNIQUE, -- e.g. "gpt-4o-mini"
  display_name                TEXT NOT NULL,        -- e.g. "GPT-4o Mini"
  model_type                  TEXT NOT NULL DEFAULT 'standard', -- 'standard' | 'reasoning'
  is_active                   BOOLEAN NOT NULL DEFAULT FALSE,

  -- Tunable parameters (user-editable in Settings UI)
  temperature                 FLOAT NOT NULL DEFAULT 0.7,
  top_p                       FLOAT,                -- 0.0–1.0, nullable
  top_k                       INTEGER,              -- nullable; Gemini/Anthropic only
  max_tokens                  INTEGER,              -- nullable
  min_tokens                  INTEGER,              -- nullable, stored only, never forwarded
  frequency_penalty           FLOAT,                -- -2.0–2.0; OpenAI standard only
  presence_penalty            FLOAT,                -- -2.0–2.0; OpenAI standard only
  seed                        INTEGER,              -- nullable; for reproducible evaluation outputs

  -- Model capability metadata (read-only, set at seed time)
  context_window              INTEGER NOT NULL,
  supports_streaming          BOOLEAN NOT NULL DEFAULT TRUE,
  supports_structured_output  BOOLEAN NOT NULL DEFAULT TRUE,
  supports_temperature        BOOLEAN NOT NULL DEFAULT TRUE,
  input_cost_per_1m           FLOAT,                -- USD per 1M input tokens
  output_cost_per_1m          FLOAT                 -- USD per 1M output tokens
);

-- Only one model can be active at a time
CREATE UNIQUE INDEX one_active_model ON model_configurations (is_active)
  WHERE is_active = TRUE;

-- Seed all models
INSERT INTO model_configurations (
  provider, model_name, display_name, model_type, is_active, temperature,
  context_window, supports_streaming, supports_structured_output, supports_temperature,
  input_cost_per_1m, output_cost_per_1m
) VALUES
  -- OpenAI standard
  ('openai','gpt-4o-mini',          'GPT-4o Mini',         'standard', TRUE,  0.7, 128000,  TRUE, TRUE, TRUE,   0.15,   0.60),
  ('openai','gpt-4o',               'GPT-4o',              'standard', FALSE, 0.7, 128000,  TRUE, TRUE, TRUE,   2.50,  10.00),
  ('openai','gpt-4.1-mini',         'GPT-4.1 Mini',        'standard', FALSE, 0.7, 1047576, TRUE, TRUE, TRUE,   0.40,   1.60),
  ('openai','gpt-4.1',              'GPT-4.1',             'standard', FALSE, 0.7, 1047576, TRUE, TRUE, TRUE,   2.00,   8.00),
  -- OpenAI reasoning
  ('openai','o4-mini',              'o4 Mini',             'reasoning',FALSE, 1.0, 200000,  TRUE, TRUE, FALSE,  1.10,   4.40),
  ('openai','o3-mini',              'o3 Mini',             'reasoning',FALSE, 1.0, 200000,  TRUE, TRUE, FALSE,  1.10,   4.40),
  -- Gemini
  ('gemini','gemini-2.0-flash-lite','Gemini 2.0 Flash Lite','standard',FALSE, 0.7, 1048576, TRUE, TRUE, TRUE,   0.075,  0.30),
  ('gemini','gemini-2.0-flash',     'Gemini 2.0 Flash',    'standard', FALSE, 0.7, 1048576, TRUE, TRUE, TRUE,   0.10,   0.40),
  ('gemini','gemini-2.5-flash',     'Gemini 2.5 Flash',    'standard', FALSE, 0.7, 1048576, TRUE, TRUE, TRUE,   0.15,   0.60),
  ('gemini','gemini-2.5-pro',       'Gemini 2.5 Pro',      'standard', FALSE, 0.7, 1048576, TRUE, TRUE, TRUE,   1.25,  10.00),
  -- Anthropic
  ('anthropic','claude-haiku-4-5',  'Claude Haiku 4.5',    'standard', FALSE, 0.7, 200000,  TRUE, TRUE, TRUE,   0.80,   4.00),
  ('anthropic','claude-sonnet-4-5', 'Claude Sonnet 4.5',   'standard', FALSE, 0.7, 200000,  TRUE, TRUE, TRUE,   3.00,  15.00),
  ('anthropic','claude-sonnet-4-6', 'Claude Sonnet 4.6',   'standard', FALSE, 0.7, 200000,  TRUE, TRUE, TRUE,   3.00,  15.00),
  ('anthropic','claude-opus-4-6',   'Claude Opus 4.6',     'standard', FALSE, 0.7, 200000,  TRUE, TRUE, TRUE,  15.00,  75.00);

-- RLS: service role full access, authenticated users read
ALTER TABLE model_configurations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all"    ON model_configurations FOR ALL    USING (auth.uid() IS NULL);
CREATE POLICY "authenticated_read"  ON model_configurations FOR SELECT USING (auth.role() = 'authenticated');
