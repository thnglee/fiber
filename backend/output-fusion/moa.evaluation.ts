import { logger } from "@/lib/logger"
import { calculateLexicalMetrics } from "@/services/evaluation.service"
import { calculateBertScore } from "@/services/bert.service"
import {
  calculateCompressionRate,
  EmptyOriginalTextError,
} from "@/services/compression.service"
import {
  judgePairwise as defaultJudgePairwise,
  type JudgePairwiseServiceResult,
} from "@/services/llm-judge.service"
import {
  resolveJudgeConfig as defaultResolveJudgeConfig,
  type EffectiveJudgeConfig,
} from "@/services/llm-judge.runner"
import { getAllModelConfigs } from "@/services/model-config.service"
import type { JudgeRequest } from "@/domain/schemas"
import type { ModelConfig } from "@/domain/types"
import type {
  MoAJudgePairwiseResult,
  MoAScores,
  MoAScoredDraft,
} from "./moa.types"

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

// ────────────────────────────────────────────────────────────────────────────
// Pairwise judge (fused vs best-draft) — Phase J4
// ────────────────────────────────────────────────────────────────────────────

/**
 * Pick the best-quality draft for pairwise comparison against the fused
 * summary. Preference order: BERTScore → ROUGE-L → ROUGE-1 → first
 * successful draft. Falls back to `null` if no draft succeeded.
 *
 * The choice is metric-driven so that pairwise reflects "fused vs the
 * strongest draft the proposer pool produced", which is the exact framing
 * the MoA paper uses for AlpacaEval.
 */
export function pickBestDraftForJudge(
  drafts: MoAScoredDraft[],
): MoAScoredDraft | null {
  const successful = drafts.filter(d => d.status === "success" && d.summary)
  if (successful.length === 0) return null

  const PREFERENCE: Array<keyof MoAScores> = ["bert_score", "rougeL", "rouge1"]

  for (const metric of PREFERENCE) {
    const scored = successful
      .map(d => ({ draft: d, value: d.scores[metric] }))
      .filter((x): x is { draft: MoAScoredDraft; value: number } =>
        typeof x.value === "number",
      )
    if (scored.length === 0) continue
    return scored.reduce((best, cur) => (cur.value > best.value ? cur : best)).draft
  }

  return successful[0]
}

export interface RunFusionPairwiseDeps {
  resolveJudgeConfig: (override?: JudgeRequest) => Promise<EffectiveJudgeConfig>
  getModelByName: (name: string) => Promise<ModelConfig | null>
  judgePairwise: (
    a: { label: string; text: string },
    b: { label: string; text: string },
    sourceArticle: string,
    opts: { model: ModelConfig; logContext?: string },
  ) => Promise<JudgePairwiseServiceResult>
}

async function defaultGetModelByName(name: string): Promise<ModelConfig | null> {
  try {
    const all = await getAllModelConfigs()
    return all.find(m => m.model_name === name) ?? null
  } catch {
    return null
  }
}

const defaultDeps: RunFusionPairwiseDeps = {
  resolveJudgeConfig: defaultResolveJudgeConfig,
  getModelByName: defaultGetModelByName,
  judgePairwise: defaultJudgePairwise,
}

export interface RunFusionPairwiseArgs {
  fusedSummary: string
  bestDraft: MoAScoredDraft
  articleText: string
  override?: JudgeRequest
}

/**
 * Resolve the active judge config and run a pairwise judge comparing the
 * fused output to the best draft. Returns `null` when:
 *   • the resolved `judge_mode` is `metrics_only` (judge disabled),
 *   • the judge model isn't found in `model_configurations`,
 *   • the judge call throws.
 *
 * All errors are swallowed and logged so a judge failure can never break the
 * MoA pipeline.
 */
export async function runFusionPairwiseJudge(
  args: RunFusionPairwiseArgs,
  deps?: Partial<RunFusionPairwiseDeps>,
): Promise<MoAJudgePairwiseResult | null> {
  const merged: RunFusionPairwiseDeps = { ...defaultDeps, ...deps }
  const effective = await merged.resolveJudgeConfig(args.override)
  if (effective.judge_mode === "metrics_only") return null

  const model = await merged.getModelByName(effective.judge_model)
  if (!model) {
    logger.addLog("moa-evaluation", "judge-model-missing", {
      requested_model: effective.judge_model,
    })
    return null
  }

  const aLabel = "fused"
  const bLabel = `best_draft:${args.bestDraft.model_name}`

  try {
    const verdict = await merged.judgePairwise(
      { label: aLabel, text: args.fusedSummary },
      { label: bLabel, text: args.bestDraft.summary },
      args.articleText,
      { model, logContext: "moa-pairwise-judge" },
    )
    logger.addLog("moa-evaluation", "judge-pairwise-complete", {
      winner: verdict.winner,
      winner_label: verdict.winner_label,
      latency_ms: verdict.latency_ms,
      cost_usd: verdict.cost_usd,
    })
    return {
      summary_a_label: aLabel,
      summary_b_label: bLabel,
      winner: verdict.winner,
      winner_label: verdict.winner_label,
      per_dimension: verdict.per_dimension,
      justification: verdict.justification,
      length_note: verdict.length_note,
      judge_model: verdict.judge_model,
      judge_cost_usd: verdict.cost_usd,
      judge_latency_ms: verdict.latency_ms,
      position_swapped: verdict.position_swapped,
    }
  } catch (err) {
    logger.addLog("moa-evaluation", "judge-pairwise-error", {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}
