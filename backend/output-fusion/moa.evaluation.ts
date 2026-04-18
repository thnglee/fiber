import { logger } from "@/lib/logger"
import { calculateLexicalMetrics } from "@/services/evaluation.service"
import { calculateBertScore } from "@/services/bert.service"
import {
  calculateCompressionRate,
  EmptyOriginalTextError,
} from "@/services/compression.service"
import type { MoAScores, MoAScoredDraft } from "./moa.types"

const SCORE_METRIC_KEYS: Array<keyof MoAScores> = [
  "rouge1",
  "rouge2",
  "rougeL",
  "bleu",
  "bert_score",
  "compression_rate",
]

/**
 * Score a summary against the original article. ROUGE/BLEU/BERTScore are
 * computed against the article text (content coverage, not classical
 * summarization quality). BERTScore is the semantic-similarity signal and
 * may be null if the HF Space is unavailable.
 */
export async function scoreSummary(
  summary: string,
  originalArticle: string,
): Promise<MoAScores> {
  // Lexical metrics are synchronous. Wrap in try/catch so a single metric
  // error cannot sink the whole pipeline.
  let rouge1: number | null = null
  let rouge2: number | null = null
  let rougeL: number | null = null
  let bleu: number | null = null
  try {
    const lexical = calculateLexicalMetrics(summary, originalArticle)
    rouge1 = lexical.rouge1
    rouge2 = lexical.rouge2
    rougeL = lexical.rougeL
    bleu = lexical.bleu
  } catch (err) {
    logger.addLog("moa-evaluation", "lexical-error", {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  let bertScore: number | null = null
  try {
    bertScore = await calculateBertScore(originalArticle, summary)
  } catch (err) {
    logger.addLog("moa-evaluation", "bert-error", {
      error: err instanceof Error ? err.message : String(err),
    })
    bertScore = null
  }

  let compressionRate: number | null = null
  try {
    const compression = calculateCompressionRate({
      originalText: originalArticle,
      summaryText: summary,
    })
    compressionRate = compression.compressionRate
  } catch (err) {
    if (!(err instanceof EmptyOriginalTextError)) {
      logger.addLog("moa-evaluation", "compression-error", {
        error: err instanceof Error ? err.message : String(err),
      })
    }
    compressionRate = null
  }

  return {
    rouge1,
    rouge2,
    rougeL,
    bleu,
    bert_score: bertScore,
    compression_rate: compressionRate,
  }
}

export interface FusedVsDraftComparison {
  metric: keyof MoAScores
  fused: number
  bestSingle: number
  delta: number
  improved: boolean
}

/**
 * Compare fused summary scores against the best single draft per metric.
 * Metrics where either side lacks a numeric score are skipped.
 */
export function compareFusedVsDrafts(
  fusedScores: MoAScores,
  draftScores: MoAScoredDraft[],
): FusedVsDraftComparison[] {
  const comparisons: FusedVsDraftComparison[] = []

  for (const metric of SCORE_METRIC_KEYS) {
    const fusedValue = fusedScores[metric]
    if (typeof fusedValue !== "number") continue

    const draftValues = draftScores
      .map(d => d.scores[metric])
      .filter((v): v is number => typeof v === "number")

    if (draftValues.length === 0) continue

    // For compression_rate, lower is better; for everything else, higher is better.
    const bestSingle =
      metric === "compression_rate" ? Math.min(...draftValues) : Math.max(...draftValues)
    const delta = fusedValue - bestSingle
    const improved = metric === "compression_rate" ? delta < 0 : delta > 0

    comparisons.push({ metric, fused: fusedValue, bestSingle, delta, improved })
  }

  return comparisons
}
