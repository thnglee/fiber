-- Add bert_score column to evaluation_metrics table
-- Stores BERTScore F1 from the Hugging Face microservice (0.0 – 1.0)
ALTER TABLE public.evaluation_metrics ADD COLUMN IF NOT EXISTS bert_score FLOAT;
