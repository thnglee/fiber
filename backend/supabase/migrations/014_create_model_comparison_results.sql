CREATE TABLE model_comparison_results (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routing_id          UUID REFERENCES routing_decisions(id) ON DELETE CASCADE,
  model_name          TEXT NOT NULL,
  summary             TEXT NOT NULL,
  bert_score          NUMERIC(6,4),
  rouge1              NUMERIC(6,4),
  prompt_tokens       INTEGER,
  completion_tokens   INTEGER,
  estimated_cost_usd  NUMERIC(10,6),
  latency_ms          INTEGER,
  selected            BOOLEAN DEFAULT FALSE,     -- TRUE for the winner
  created_at          TIMESTAMPTZ DEFAULT now()
);
