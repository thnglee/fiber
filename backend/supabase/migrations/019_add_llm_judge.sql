-- Migration: LLM-Judge evaluation columns + pairwise table
-- Adds judge_* columns to evaluation_metrics for per-summary judge results
-- (rubric/absolute) and creates llm_judge_pairwise to record fused-vs-best-draft
-- preference comparisons emitted during fusion runs.

ALTER TABLE evaluation_metrics
  ADD COLUMN IF NOT EXISTS judge_mode          TEXT,
  ADD COLUMN IF NOT EXISTS judge_model         TEXT,
  ADD COLUMN IF NOT EXISTS judge_style         TEXT,
  ADD COLUMN IF NOT EXISTS judge_rubric        JSONB,
  ADD COLUMN IF NOT EXISTS judge_absolute      INTEGER,
  ADD COLUMN IF NOT EXISTS judge_justification TEXT,
  ADD COLUMN IF NOT EXISTS judge_latency_ms    INTEGER,
  ADD COLUMN IF NOT EXISTS judge_cost_usd      NUMERIC(10, 6);

CREATE TABLE IF NOT EXISTS llm_judge_pairwise (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  routing_id UUID REFERENCES routing_decisions(id)   ON DELETE SET NULL,
  fusion_id  UUID REFERENCES moa_fusion_results(id)  ON DELETE CASCADE,

  summary_a_label TEXT NOT NULL,
  summary_b_label TEXT NOT NULL,
  winner          TEXT NOT NULL CHECK (winner IN ('A', 'B', 'tie')),
  per_dimension   JSONB,
  justification   TEXT,
  length_note     TEXT,

  judge_model      TEXT NOT NULL,
  judge_cost_usd   NUMERIC(10, 6),
  judge_latency_ms INTEGER,
  position_swapped BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_llm_judge_pairwise_fusion  ON llm_judge_pairwise(fusion_id);
CREATE INDEX IF NOT EXISTS idx_llm_judge_pairwise_routing ON llm_judge_pairwise(routing_id);
CREATE INDEX IF NOT EXISTS idx_llm_judge_pairwise_created ON llm_judge_pairwise(created_at DESC);

ALTER TABLE llm_judge_pairwise ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "llm_judge_pairwise_service_role_all" ON llm_judge_pairwise;
CREATE POLICY "llm_judge_pairwise_service_role_all"
  ON llm_judge_pairwise
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Seed default judge config in app_settings (mirrors routing_config seed in 017)
INSERT INTO app_settings (key, value)
VALUES (
  'judge_config',
  '{"judge_mode":"metrics_only","default_judge_model":"gpt-4o","default_judge_style":"rubric"}'::jsonb
)
ON CONFLICT (key) DO NOTHING;
