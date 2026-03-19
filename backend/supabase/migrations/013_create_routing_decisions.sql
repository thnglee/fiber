CREATE TABLE routing_decisions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NOTE: evaluation_metrics points back here via routing_id FK (added in migration 015).
  -- No FK stored here to avoid circular dependency at insert time.
  article_length  INTEGER,                   -- char count of input
  article_tokens  INTEGER,                   -- estimated token count
  category        TEXT,                      -- from LLM output (thoi_su, kinh_te, etc.)
  complexity      TEXT NOT NULL,             -- 'short' | 'medium' | 'long'
  routing_mode    TEXT NOT NULL,             -- 'auto' | 'evaluation' | 'forced'
  selected_model  TEXT NOT NULL,             -- model that was actually used
  fallback_used   BOOLEAN DEFAULT FALSE,
  fallback_reason TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
