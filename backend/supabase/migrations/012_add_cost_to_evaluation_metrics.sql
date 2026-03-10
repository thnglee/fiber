ALTER TABLE evaluation_metrics
  ADD COLUMN prompt_tokens      INTEGER,
  ADD COLUMN completion_tokens  INTEGER,
  ADD COLUMN estimated_cost_usd FLOAT;
