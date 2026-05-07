-- Migration: pipeline_mode on moa_fusion_results
--
-- Distinguishes how the fused output was produced. Used by the LLM-ranker
-- baseline (P0-5 in fix_plan.md) to attribute rows to either the full
-- aggregate-and-synthesize pipeline or the cheaper "judge picks best draft"
-- baseline that the unified report compares against.
--
--   'moa_synthesis'   — Default. K proposers + LLM aggregator (the paper's
--                        Layer-2 pipeline). Existing rows backfill via DEFAULT.
--   'llm_ranker'      — N-way judge ranker selects the top draft and emits it
--                        directly as the "fused" summary. No aggregator call,
--                        so aggregator_* columns will be null/empty for these
--                        rows. Lets us answer: does MoA aggregate, or just
--                        pick? (Wang et al. 2024 Figure 4a equivalent.)

ALTER TABLE moa_fusion_results
  ADD COLUMN IF NOT EXISTS pipeline_mode TEXT NOT NULL DEFAULT 'moa_synthesis';

ALTER TABLE moa_fusion_results
  DROP CONSTRAINT IF EXISTS moa_fusion_results_pipeline_mode_check;

ALTER TABLE moa_fusion_results
  ADD CONSTRAINT moa_fusion_results_pipeline_mode_check
  CHECK (pipeline_mode IN ('moa_synthesis', 'llm_ranker'));

CREATE INDEX IF NOT EXISTS idx_moa_fusion_pipeline_mode
  ON moa_fusion_results(pipeline_mode);
