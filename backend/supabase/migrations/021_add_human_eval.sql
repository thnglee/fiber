-- Migration: Human-eval blind ranking tables (Stage 5, M-D).
-- Creates `human_eval_tasks` (admin-built bundles of an article + K candidate
-- summaries with model labels hidden) and `human_eval_responses` (per-rater
-- ranking + rationale). The /evaluate page consumes tasks; raters submit
-- responses; admin report computes Fleiss' κ + CSV export from these rows.

CREATE TABLE IF NOT EXISTS human_eval_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  article_url  TEXT NOT NULL,
  article_text TEXT NOT NULL,

  -- summaries: [{ label: 'A', text: '...', hidden_model: 'gpt-4o', hidden_mode: 'fusion', evaluation_metric_id?: '<uuid>' }, ...]
  summaries JSONB NOT NULL,

  notes      TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_human_eval_tasks_created
  ON human_eval_tasks(created_at DESC);

CREATE TABLE IF NOT EXISTS human_eval_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  task_id UUID NOT NULL REFERENCES human_eval_tasks(id) ON DELETE CASCADE,

  -- Free-form rater identifier (email hash, name, etc). Not authenticated.
  rater_id TEXT NOT NULL,

  -- ranking: ordered list of labels best→worst, e.g. ["B","A","C"]
  ranking JSONB NOT NULL,

  -- rationale: { "A": "one sentence", "B": "...", "C": "..." }
  rationale JSONB NOT NULL,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_human_eval_responses_task
  ON human_eval_responses(task_id);
CREATE INDEX IF NOT EXISTS idx_human_eval_responses_created
  ON human_eval_responses(created_at DESC);

-- Prevent the same rater from submitting twice for the same task.
CREATE UNIQUE INDEX IF NOT EXISTS uq_human_eval_responses_task_rater
  ON human_eval_responses(task_id, rater_id);

ALTER TABLE human_eval_tasks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE human_eval_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "human_eval_tasks_service_role_all" ON human_eval_tasks;
CREATE POLICY "human_eval_tasks_service_role_all"
  ON human_eval_tasks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "human_eval_responses_service_role_all" ON human_eval_responses;
CREATE POLICY "human_eval_responses_service_role_all"
  ON human_eval_responses
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
