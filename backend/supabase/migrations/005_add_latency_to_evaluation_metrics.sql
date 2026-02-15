-- Add latency column to evaluation_metrics table
-- Latency is stored in milliseconds
ALTER TABLE public.evaluation_metrics ADD COLUMN IF NOT EXISTS latency INTEGER;
