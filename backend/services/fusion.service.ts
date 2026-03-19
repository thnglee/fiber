import { logger } from "@/lib/logger"
import { getSupabaseAdmin } from "@/lib/supabase"
import { performSummarize } from "./summarize.service"
import { calculateBertScore } from "./bert.service"
import { calculateLexicalMetrics } from "./evaluation.service"
import {
  saveRoutingDecision,
  estimateTokenCount,
  classifyComplexity,
  MODEL_VIT5,
  MODEL_PHOGPT,
  MODEL_GPT4O,
} from "./routing.service"
import type { ModelConfig, ModelComparisonResult, FusionResult } from "@/domain/types"

// Tie-break preference: cheaper/specialized models preferred
const TIE_BREAK_ORDER = [MODEL_VIT5, MODEL_PHOGPT, MODEL_GPT4O]

// ============================================================================
// Main export
// ============================================================================

/**
 * Run all candidate models in parallel and select the best summary
 * using BERTScore (or ROUGE-1 as fallback).
 *
 * Used in evaluation routing mode for thesis comparison experiments.
 */
export async function runFusedSummarization(
  text: string,
  website: string | undefined,
  models: ModelConfig[],
): Promise<FusionResult> {
  logger.addLog('fusion', 'start', {
    modelCount: models.length,
    models: models.map(m => m.model_name),
    textLength: text.length,
  })

  // 1. Run all models in parallel via Promise.allSettled
  const results = await Promise.allSettled(
    models.map(async (modelConfig) => {
      const startTime = performance.now()

      const response = await performSummarize(
        { content: text, url: website },
        modelConfig,
      )

      const latencyMs = Math.round(performance.now() - startTime)

      return {
        modelConfig,
        response,
        latencyMs,
      }
    })
  )

  // 2. Collect fulfilled results, log rejected ones
  const fulfilled: Array<{
    modelConfig: ModelConfig
    response: Awaited<ReturnType<typeof performSummarize>>
    latencyMs: number
  }> = []

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const modelName = models[i].model_name
    if (result.status === 'fulfilled') {
      fulfilled.push(result.value)
    } else {
      logger.addLog('fusion', 'model-failed', {
        model: modelName,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      })
    }
  }

  if (fulfilled.length === 0) {
    throw new Error('All models failed during fusion — no summaries produced')
  }

  // 3. Score each summary with BERTScore (original article as reference)
  //    Fall back to ROUGE-1 if BERTScore is unavailable
  const candidates: ModelComparisonResult[] = await Promise.all(
    fulfilled.map(async ({ modelConfig, response, latencyMs }) => {
      let bertScore: number | null = null
      let rouge1: number | null = null

      try {
        bertScore = await calculateBertScore(text, response.summary)
      } catch (err) {
        logger.addLog('fusion', 'bert-score-error', {
          model: modelConfig.model_name,
          error: err instanceof Error ? err.message : String(err),
        })
      }

      // Always calculate ROUGE-1 as fallback scoring metric
      try {
        const lexical = calculateLexicalMetrics(response.summary, text)
        rouge1 = lexical.rouge1
      } catch (err) {
        logger.addLog('fusion', 'rouge-error', {
          model: modelConfig.model_name,
          error: err instanceof Error ? err.message : String(err),
        })
      }

      // Cost calculation
      const promptTokens = response.usage?.prompt_tokens ?? null
      const completionTokens = response.usage?.completion_tokens ?? null
      const estimatedCostUsd = (promptTokens != null && completionTokens != null)
        ? (promptTokens / 1_000_000 * (modelConfig.input_cost_per_1m ?? 0))
          + (completionTokens / 1_000_000 * (modelConfig.output_cost_per_1m ?? 0))
        : null

      return {
        model_name: modelConfig.model_name,
        summary: response.summary,
        bert_score: bertScore,
        rouge1,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        estimated_cost_usd: estimatedCostUsd,
        latency_ms: latencyMs,
        selected: false, // will mark winner below
      } satisfies ModelComparisonResult
    })
  )

  // 4. Select winner
  const winner = selectWinner(candidates)
  winner.selected = true

  logger.addLog('fusion', 'winner-selected', {
    model: winner.model_name,
    bertScore: winner.bert_score,
    rouge1: winner.rouge1,
    latencyMs: winner.latency_ms,
  })

  // 5. Persist routing decision + comparison results
  const articleTokens = estimateTokenCount(text)
  const complexity = classifyComplexity(text)

  const routingId = await saveRoutingDecision({
    article_length: text.length,
    article_tokens: articleTokens,
    complexity,
    routing_mode: 'evaluation',
    selected_model: winner.model_name,
    fallback_used: false,
  })

  if (routingId) {
    await saveModelComparisonResults(routingId, candidates)
  }

  return {
    winner: { summary: winner.summary, model: winner.model_name },
    candidates,
    routingId: routingId ?? '',
  }
}

// ============================================================================
// Winner selection
// ============================================================================

/**
 * Select the best candidate by highest BERTScore.
 * Falls back to ROUGE-1 if no BERTScore is available.
 * Tie-break: prefer ViT5 → PhoGPT → GPT-4o (cheaper/specialized first).
 */
function selectWinner(candidates: ModelComparisonResult[]): ModelComparisonResult {
  const hasBertScores = candidates.some(c => c.bert_score != null)
  const scoreKey: 'bert_score' | 'rouge1' = hasBertScores ? 'bert_score' : 'rouge1'

  let best = candidates[0]
  for (const candidate of candidates.slice(1)) {
    const bestScore = best[scoreKey] ?? -1
    const candidateScore = candidate[scoreKey] ?? -1

    if (candidateScore > bestScore) {
      best = candidate
    } else if (candidateScore === bestScore) {
      // Tie-break by preference order
      const bestRank = TIE_BREAK_ORDER.indexOf(best.model_name)
      const candidateRank = TIE_BREAK_ORDER.indexOf(candidate.model_name)
      if (candidateRank !== -1 && (bestRank === -1 || candidateRank < bestRank)) {
        best = candidate
      }
    }
  }

  return best
}

// ============================================================================
// Persistence — model comparison results
// ============================================================================

async function saveModelComparisonResults(
  routingId: string,
  candidates: ModelComparisonResult[],
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin()
    const rows = candidates.map(c => ({
      routing_id: routingId,
      model_name: c.model_name,
      summary: c.summary,
      bert_score: c.bert_score,
      rouge1: c.rouge1,
      prompt_tokens: c.prompt_tokens,
      completion_tokens: c.completion_tokens,
      estimated_cost_usd: c.estimated_cost_usd,
      latency_ms: c.latency_ms,
      selected: c.selected,
    }))

    const { error } = await supabase
      .from('model_comparison_results')
      .insert(rows)

    if (error) {
      logger.addLog('fusion', 'save-comparison-error', { error: error.message })
    } else {
      logger.addLog('fusion', 'save-comparison-ok', { count: rows.length, routingId })
    }
  } catch (err) {
    logger.addLog('fusion', 'save-comparison-exception', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
