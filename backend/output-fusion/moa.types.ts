import type { ModelConfig } from "@/domain/types"
import type { JudgeRequest, JudgePairwiseDimensions, JudgeVerdict } from "@/domain/schemas"

export interface MoAConfig {
  proposers: ModelConfig[]
  aggregator: ModelConfig
  proposerTimeoutMs: number
  minSuccessfulDrafts: number
  includeEvaluation: boolean
  /**
   * Per-request override for the LLM-judge config (read from
   * `app_settings.judge_config` when not set). When the resolved
   * `judge_mode` ≠ "metrics_only", `runMoAFusion` runs a pairwise judge of
   * fused vs best-draft and attaches the verdict to the result.
   */
  judgeOverride?: JudgeRequest
  /**
   * When true and the judge is enabled, additionally run a pairwise judge of
   * fused vs each successful proposer draft (one verdict per draft). Used for
   * the Wang et al. (2024) Figure 4a / Table 4-style per-proposer breakdown.
   * Verdicts surface on `MoAFusionResult.judge_vs_drafts`.
   */
  judgeVsAllDrafts?: boolean
}

/**
 * Kind of pairwise verdict, used by persistence and the unified report to
 * group rows. See `023_add_comparison_type.sql` + `025_add_single_aggregator_comparison.sql`
 * for the source of truth. The DB enum still includes the deprecated
 * `synthesis_vs_ranker` value for historical rows; we no longer write it.
 */
export type PairwiseComparisonType =
  | "vs_best_draft"
  | "vs_individual_draft"
  | "vs_single_aggregator"

/**
 * Pairwise (AlpacaEval-style) verdict for fused vs best-draft. Caller-side
 * convention: `summary_a_label` is always the fused output, `summary_b_label`
 * is the best draft. `winner === "A"` means fused won; the runner has already
 * un-flipped position-randomization before populating this field.
 */
export interface MoAJudgePairwiseResult {
  summary_a_label: string
  summary_b_label: string
  winner: JudgeVerdict
  winner_label: string
  per_dimension: JudgePairwiseDimensions
  justification: string
  length_note: string
  judge_model: string
  judge_cost_usd: number | null
  judge_latency_ms: number
  position_swapped: boolean
  comparison_type: PairwiseComparisonType
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
  /** AlpacaEval-style verdict; `null` when judge is disabled or call fails. */
  judge_pairwise?: MoAJudgePairwiseResult | null
  /**
   * One pairwise verdict per successful proposer draft, populated when
   * `MoAConfig.judgeVsAllDrafts === true`. Empty array when the option is off
   * or the judge is disabled.
   */
  judge_vs_drafts?: MoAJudgePairwiseResult[]
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
