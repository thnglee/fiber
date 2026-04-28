-- Migration: Factuality (claim-entailment) columns on evaluation_metrics.
-- Adds per-summary factuality scoring fields produced by
-- backend/services/factuality.service.ts. Hallucinations + not-mentioned
-- claims are stored as JSONB arrays for the metrics-page tooltip.
--
-- Also extends app_settings.judge_config with factuality toggles so the
-- existing /api/settings/judge route can manage the flag in-place.

ALTER TABLE evaluation_metrics
  ADD COLUMN IF NOT EXISTS factuality_total_claims    INTEGER,
  ADD COLUMN IF NOT EXISTS factuality_entailed_claims INTEGER,
  ADD COLUMN IF NOT EXISTS factuality_entailed_ratio  NUMERIC(6, 4),
  ADD COLUMN IF NOT EXISTS factuality_hallucinations  JSONB,
  ADD COLUMN IF NOT EXISTS factuality_not_mentioned   JSONB,
  ADD COLUMN IF NOT EXISTS factuality_model           TEXT,
  ADD COLUMN IF NOT EXISTS factuality_cost_usd        NUMERIC(10, 6),
  ADD COLUMN IF NOT EXISTS factuality_latency_ms      INTEGER;

-- Patch the seeded judge_config with factuality defaults. UPDATE-only so we
-- don't overwrite operator changes; the new keys merge in via JSONB ||.
UPDATE app_settings
SET value = value || jsonb_build_object(
              'factuality_enabled', false,
              'factuality_model',   'gpt-4o-mini'
            ),
    updated_at = now()
WHERE key = 'judge_config'
  AND NOT (value ? 'factuality_enabled');
