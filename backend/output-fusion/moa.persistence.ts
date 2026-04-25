import { logger } from "@/lib/logger"
import { getSupabaseAdmin } from "@/lib/supabase"
import type { MoAFusionResult, MoAJudgePairwiseResult } from "./moa.types"

export interface SaveMoAFusionInput {
  result: MoAFusionResult
  articleUrl?: string
  routingId?: string | null
}

/**
 * Persist a MoA fusion run to Supabase. Inserts the parent `moa_fusion_results`
 * row and all per-draft children. Returns the fusion_id on success, or null
 * on any failure (never throws — MoA must not be blocked by persistence).
 */
export async function saveMoAFusionResult(input: SaveMoAFusionInput): Promise<string | null> {
  const { result, articleUrl, routingId } = input
  try {
    const supabase = getSupabaseAdmin()

    const { data: fusionRow, error: fusionError } = await supabase
      .from("moa_fusion_results")
      .insert({
        routing_id: routingId ?? null,
        fused_summary: result.fused.summary,
        fused_category: result.fused.category,
        fused_reading_time: result.fused.readingTime,
        fused_rouge1: result.fused.scores.rouge1,
        fused_rouge2: result.fused.scores.rouge2,
        fused_rouge_l: result.fused.scores.rougeL,
        fused_bleu: result.fused.scores.bleu,
        fused_bert_score: result.fused.scores.bert_score,
        fused_compression_rate: result.fused.scores.compression_rate,
        aggregator_model: result.aggregator.model_name,
        aggregator_provider: result.aggregator.provider,
        aggregator_latency_ms: result.aggregator.latency_ms,
        aggregator_prompt_tokens: result.aggregator.prompt_tokens,
        aggregator_completion_tokens: result.aggregator.completion_tokens,
        aggregator_cost_usd: result.aggregator.estimated_cost_usd,
        total_latency_ms: result.pipeline.total_latency_ms,
        total_cost_usd: result.pipeline.total_cost_usd,
        proposer_count: result.pipeline.proposer_count,
        successful_proposers: result.pipeline.successful_proposers,
        failed_proposers: result.pipeline.failed_proposers,
        article_url: articleUrl ?? null,
      })
      .select("id")
      .single()

    if (fusionError || !fusionRow) {
      logger.addLog("moa-persistence", "fusion-insert-error", {
        error: fusionError?.message,
      })
      return null
    }

    const fusionId = fusionRow.id as string

    if (result.drafts.length > 0) {
      const { error: draftsError } = await supabase.from("moa_draft_results").insert(
        result.drafts.map(draft => ({
          fusion_id: fusionId,
          model_name: draft.model_name,
          provider: draft.provider,
          summary: draft.summary,
          status: draft.status,
          error: draft.error ?? null,
          rouge1: draft.scores.rouge1,
          rouge2: draft.scores.rouge2,
          rouge_l: draft.scores.rougeL,
          bleu: draft.scores.bleu,
          bert_score: draft.scores.bert_score,
          compression_rate: draft.scores.compression_rate,
          latency_ms: draft.latency_ms,
          prompt_tokens: draft.prompt_tokens,
          completion_tokens: draft.completion_tokens,
          estimated_cost_usd: draft.estimated_cost_usd,
        })),
      )

      if (draftsError) {
        logger.addLog("moa-persistence", "drafts-insert-error", {
          fusionId,
          error: draftsError.message,
        })
      }
    }

    return fusionId
  } catch (err) {
    logger.addLog("moa-persistence", "exception", {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

export interface SaveLLMJudgePairwiseInput {
  verdict: MoAJudgePairwiseResult
  routingId?: string | null
  fusionId?: string | null
}

/**
 * Persist a pairwise verdict to `llm_judge_pairwise`. Returns the inserted id
 * or `null` on failure (never throws — judge persistence must not block the
 * MoA pipeline).
 */
export async function saveLLMJudgePairwise(
  input: SaveLLMJudgePairwiseInput,
): Promise<string | null> {
  const { verdict, routingId, fusionId } = input
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from("llm_judge_pairwise")
      .insert({
        routing_id: routingId ?? null,
        fusion_id: fusionId ?? null,
        summary_a_label: verdict.summary_a_label,
        summary_b_label: verdict.summary_b_label,
        winner: verdict.winner,
        per_dimension: verdict.per_dimension,
        justification: verdict.justification,
        length_note: verdict.length_note,
        judge_model: verdict.judge_model,
        judge_cost_usd: verdict.judge_cost_usd,
        judge_latency_ms: verdict.judge_latency_ms,
        position_swapped: verdict.position_swapped,
      })
      .select("id")
      .single()

    if (error || !data) {
      logger.addLog("moa-persistence", "judge-pairwise-insert-error", {
        error: error?.message,
      })
      return null
    }

    return data.id as string
  } catch (err) {
    logger.addLog("moa-persistence", "judge-pairwise-exception", {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}
