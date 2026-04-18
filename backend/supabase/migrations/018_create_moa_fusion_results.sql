-- Migration: MoA (Mixture-of-Agents) output-fusion results
-- Stores one row per fusion run (moa_fusion_results) and one row per proposer
-- draft in that run (moa_draft_results). The `routing_id` points at the
-- routing_decisions row saved alongside each fusion run so the existing
-- routing analytics pages can link back to the MoA details.

CREATE TABLE IF NOT EXISTS moa_fusion_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routing_id UUID REFERENCES routing_decisions(id) ON DELETE SET NULL,

  -- Fused output
  fused_summary       TEXT NOT NULL,
  fused_category      TEXT,
  fused_reading_time  INTEGER,

  -- Fused scores
  fused_rouge1            REAL,
  fused_rouge2            REAL,
  fused_rouge_l           REAL,
  fused_bleu              REAL,
  fused_bert_score        REAL,
  fused_compression_rate  REAL,

  -- Aggregator metadata
  aggregator_model              TEXT NOT NULL,
  aggregator_provider           TEXT NOT NULL,
  aggregator_latency_ms         INTEGER,
  aggregator_prompt_tokens      INTEGER,
  aggregator_completion_tokens  INTEGER,
  aggregator_cost_usd           REAL,

  -- Pipeline metadata
  total_latency_ms      INTEGER,
  total_cost_usd        REAL,
  proposer_count        INTEGER,
  successful_proposers  INTEGER,
  failed_proposers      TEXT[],

  article_url   TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS moa_draft_results (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fusion_id  UUID REFERENCES moa_fusion_results(id) ON DELETE CASCADE,
  model_name TEXT NOT NULL,
  provider   TEXT NOT NULL,
  summary    TEXT NOT NULL,
  status     TEXT NOT NULL,   -- 'success' | 'failed' | 'timeout'
  error      TEXT,

  -- Per-draft scores
  rouge1            REAL,
  rouge2            REAL,
  rouge_l           REAL,
  bleu              REAL,
  bert_score        REAL,
  compression_rate  REAL,

  -- Per-draft metadata
  latency_ms          INTEGER,
  prompt_tokens       INTEGER,
  completion_tokens   INTEGER,
  estimated_cost_usd  REAL,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_moa_fusion_created  ON moa_fusion_results(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moa_fusion_routing  ON moa_fusion_results(routing_id);
CREATE INDEX IF NOT EXISTS idx_moa_drafts_fusion   ON moa_draft_results(fusion_id);

-- RLS: allow service role full access; block anon.
ALTER TABLE moa_fusion_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE moa_draft_results  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "moa_fusion_service_role_all" ON moa_fusion_results;
CREATE POLICY "moa_fusion_service_role_all"
  ON moa_fusion_results
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "moa_drafts_service_role_all" ON moa_draft_results;
CREATE POLICY "moa_drafts_service_role_all"
  ON moa_draft_results
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
