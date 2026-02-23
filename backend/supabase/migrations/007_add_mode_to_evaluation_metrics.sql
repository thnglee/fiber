-- 'stream' = streaming (latency = time-to-first-chunk)
-- 'sync'   = non-streaming (latency = full request duration)
ALTER TABLE public.evaluation_metrics ADD COLUMN IF NOT EXISTS mode TEXT;
