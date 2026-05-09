-- Migration: extend comparison_type with vs_single_aggregator
--
-- Adds the P0-8 thesis-decisive comparison: fused (MoA pipeline) vs the
-- aggregator model (gpt-4o) running alone on the same article.
--
--   'vs_single_aggregator' — A=fused (MoA: 3 proposers + gpt-4o aggregator),
--                            B=gpt-4o-alone summary (forced mode, no proposer
--                            drafts). Isolates synthesis behavior from
--                            aggregator model capability — the central
--                            thesis-defense question: "does fusion add value
--                            over just running gpt-4o?"
--
-- 'synthesis_vs_ranker' is retained in the CHECK constraint for historical
-- rows from before the LLM-Ranker feature was removed (2026-05-09); no new
-- rows of that type are written.

ALTER TABLE llm_judge_pairwise
  DROP CONSTRAINT IF EXISTS llm_judge_pairwise_comparison_type_check;

ALTER TABLE llm_judge_pairwise
  ADD CONSTRAINT llm_judge_pairwise_comparison_type_check
  CHECK (comparison_type IN (
    'vs_best_draft',
    'vs_individual_draft',
    'synthesis_vs_ranker',
    'vs_single_aggregator'
  ));
