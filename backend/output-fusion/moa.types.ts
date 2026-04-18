import type { ModelConfig } from "@/domain/types"

export interface MoAConfig {
  proposers: ModelConfig[]
  aggregator: ModelConfig
  proposerTimeoutMs: number
  minSuccessfulDrafts: number
  includeEvaluation: boolean
}

export interface ModelAvailability {
  model_name: string
  display_name: string
  provider: string
  is_available: boolean
  unavailable_reason?: string
  can_be_proposer: boolean
  can_be_aggregator: boolean
}

export type MoADraftStatus = "success" | "failed" | "timeout"

export interface MoADraftResult {
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
}

export interface MoAScores {
  rouge1: number | null
  rouge2: number | null
  rougeL: number | null
  bleu: number | null
  bert_score: number | null
  compression_rate: number | null
}

export interface MoAScoredDraft extends MoADraftResult {
  scores: MoAScores
}

export interface MoAFusionResult {
  fused: {
    summary: string
    category: string
    readingTime: number
    scores: MoAScores
  }
  drafts: MoAScoredDraft[]
  aggregator: {
    model_name: string
    provider: string
    latency_ms: number
    prompt_tokens: number | null
    completion_tokens: number | null
    estimated_cost_usd: number | null
  }
  pipeline: {
    total_latency_ms: number
    total_cost_usd: number | null
    total_tokens: number | null
    proposer_count: number
    successful_proposers: number
    failed_proposers: string[]
  }
  routing_id?: string
}

export class MoAInsufficientDraftsError extends Error {
  readonly successfulCount: number
  readonly requiredCount: number
  readonly failedModels: string[]

  constructor(successfulCount: number, requiredCount: number, failedModels: string[]) {
    super(
      `MoA pipeline needed at least ${requiredCount} successful drafts but only got ${successfulCount}. ` +
        `Failed proposers: ${failedModels.join(", ") || "(none reported)"}`,
    )
    this.name = "MoAInsufficientDraftsError"
    this.successfulCount = successfulCount
    this.requiredCount = requiredCount
    this.failedModels = failedModels
  }
}
