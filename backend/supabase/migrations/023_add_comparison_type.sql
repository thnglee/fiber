-- Migration: comparison_type on llm_judge_pairwise
--
-- Distinguishes the kind of pairwise verdict so the unified report can
-- compute per-draft win rates (Wang et al. 2024 Figure 4a + Table 4 style)
-- alongside the existing fused-vs-best-draft headline.
--
--   'vs_best_draft'        — A=fused, B=best draft picked by judge ranker
--                             (existing headline; used for the sign test that
--                             lives in the thesis defense).
--   'vs_individual_draft'  — A=fused, B=one specific proposer draft. Emitted
--                             once per successful proposer when --judge-vs-all
--                             is on. Lets us compute "fused win rate vs
--                             gpt-4o-mini", "vs gemini-2.5-flash", etc.
--   'synthesis_vs_ranker'  — Reserved for P0-5 (LLM-ranker baseline). A=fused
--                             synthesis, B=top-1 draft picked by judge ranker
--                             without any aggregator call. Tells us whether
--                             MoA actually aggregates or merely selects.
--
-- DEFAULT 'vs_best_draft' backfills the 29 historical rows.

ALTER TABLE llm_judge_pairwise
  ADD COLUMN IF NOT EXISTS comparison_type TEXT NOT NULL DEFAULT 'vs_best_draft';

ALTER TABLE llm_judge_pairwise
  DROP CONSTRAINT IF EXISTS llm_judge_pairwise_comparison_type_check;

ALTER TABLE llm_judge_pairwise
  ADD CONSTRAINT llm_judge_pairwise_comparison_type_check
  CHECK (comparison_type IN ('vs_best_draft', 'vs_individual_draft', 'synthesis_vs_ranker'));

CREATE INDEX IF NOT EXISTS idx_llm_judge_pairwise_comparison_type
  ON llm_judge_pairwise(comparison_type);
