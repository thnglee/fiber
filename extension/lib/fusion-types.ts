/**
 * Extension-side mirror of the backend `MoAFusionResult` and friends.
 * Keep in sync with `backend/output-fusion/moa.types.ts`.
 */

export type MoADraftStatus = "success" | "failed" | "timeout"

export interface MoAScores {
  rouge1: number | null
  rouge2: number | null
  rougeL: number | null
  bleu: number | null
  bert_score: number | null
  compression_rate: number | null
}

export interface MoAScoredDraft {
  model_name: string
  provider: string
  summary: string
  category: string
  readingTime: number
  latency_ms: number
  prompt_tokens: number | null
  completion_tokens: number | null
  estimated_cost_usd: number | null
  status: MoADraftStatus
  error?: string
  scores: MoAScores
}

export interface MoAAggregatorMeta {
  model_name: string
  provider: string
  latency_ms: number
  prompt_tokens: number | null
  completion_tokens: number | null
  estimated_cost_usd: number | null
}

export interface MoAPipelineMeta {
  total_latency_ms: number
  total_cost_usd: number | null
  total_tokens: number | null
  proposer_count: number
  successful_proposers: number
  failed_proposers: string[]
}

export interface MoAFusionResult {
  fused: {
    summary: string
    category: string
    readingTime: number
    scores: MoAScores
  }
  drafts: MoAScoredDraft[]
  aggregator: MoAAggregatorMeta
  pipeline: MoAPipelineMeta
  routing_id?: string
}

export const FUSION_STORAGE_KEY = "fiberLastFusion"

export const SCORE_METRICS: { key: keyof MoAScores; label: string }[] = [
  { key: "rouge1", label: "ROUGE-1" },
  { key: "rouge2", label: "ROUGE-2" },
  { key: "rougeL", label: "ROUGE-L" },
  { key: "bleu", label: "BLEU" },
  { key: "bert_score", label: "BERTScore" },
  { key: "compression_rate", label: "Compression" },
]
