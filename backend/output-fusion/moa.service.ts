import { logger } from "@/lib/logger"
import { performSummarize } from "@/services/summarize.service"
import { generateJsonCompletion } from "@/services/llm.service"
import { SummaryDataSchema, type SummaryData } from "@/domain/schemas"
import type {
  ModelConfig,
  SummarizeRequest,
  SummarizeResponse,
} from "@/domain/types"
import { buildAggregatorPrompt } from "./moa.prompt"
import {
  scoreSummary as defaultScoreSummary,
  pickBestDraftByJudge,
  runFusionPairwiseJudge as defaultRunFusionPairwiseJudge,
  type RunFusionPairwiseArgs,
} from "./moa.evaluation"
import {
  MoAInsufficientDraftsError,
  type MoAConfig,
  type MoADraftResult,
  type MoAFusionResult,
  type MoAJudgePairwiseResult,
  type MoAScoredDraft,
  type MoAScores,
} from "./moa.types"

/**
 * Injection seam for unit tests. Callers normally use {@link runMoAFusion}
 * (which wires in the real services); tests pass in fakes.
 */
export interface MoADependencies {
  performSummarize: (
    request: SummarizeRequest,
    modelConfig?: ModelConfig,
  ) => Promise<SummarizeResponse>
  generateJsonCompletion: typeof generateJsonCompletion
  scoreSummary: (summary: string, originalArticle: string) => Promise<MoAScores>
  runFusionPairwiseJudge: (args: RunFusionPairwiseArgs) => Promise<MoAJudgePairwiseResult | null>
}

const defaultDeps: MoADependencies = {
  performSummarize,
  generateJsonCompletion,
  scoreSummary: defaultScoreSummary,
  runFusionPairwiseJudge: args => defaultRunFusionPairwiseJudge(args),
}

function computeEstimatedCost(
  model: ModelConfig,
  promptTokens: number | null,
  completionTokens: number | null,
): number | null {
  if (model.input_cost_per_1m == null) return null
  const inputCost = ((promptTokens ?? 0) / 1_000_000) * model.input_cost_per_1m
  const outputCost = ((completionTokens ?? 0) / 1_000_000) * (model.output_cost_per_1m ?? 0)
  return inputCost + outputCost
}

class ProposerTimeoutError extends Error {
  constructor(modelName: string, timeoutMs: number) {
    super(`Proposer "${modelName}" exceeded ${timeoutMs}ms timeout`)
    this.name = "ProposerTimeoutError"
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  modelName: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new ProposerTimeoutError(modelName, timeoutMs)), timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

async function runProposer(
  articleText: string,
  website: string | undefined,
  model: ModelConfig,
  timeoutMs: number,
  deps: MoADependencies,
): Promise<MoADraftResult> {
  const startTime = performance.now()
  try {
    const response = await withTimeout(
      deps.performSummarize({ content: articleText, url: website }, model),
      timeoutMs,
      model.model_name,
    )
    const latencyMs = Math.round(performance.now() - startTime)
    const promptTokens = response.usage?.prompt_tokens ?? null
    const completionTokens = response.usage?.completion_tokens ?? null
    return {
      model_name: model.model_name,
      provider: model.provider,
      summary: response.summary,
      category: response.category,
      readingTime: response.readingTime,
      latency_ms: latencyMs,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      estimated_cost_usd: computeEstimatedCost(model, promptTokens, completionTokens),
      status: "success",
    }
  } catch (err) {
    const latencyMs = Math.round(performance.now() - startTime)
    const isTimeout = err instanceof ProposerTimeoutError
    return {
      model_name: model.model_name,
      provider: model.provider,
      summary: "",
      category: "",
      readingTime: 0,
      latency_ms: latencyMs,
      prompt_tokens: null,
      completion_tokens: null,
      estimated_cost_usd: null,
      status: isTimeout ? "timeout" : "failed",
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

function pickFallbackSummary(drafts: MoADraftResult[]): SummaryData {
  // Prefer the draft with the highest completion_tokens (longest explanatory
  // draft), falling back to the first successful one.
  const successful = drafts.filter(d => d.status === "success")
  if (successful.length === 0) {
    return { summary: "", category: "Khác", readingTime: 1 }
  }
  const best = successful.reduce((a, b) =>
    (b.completion_tokens ?? 0) > (a.completion_tokens ?? 0) ? b : a,
  )
  return {
    summary: best.summary,
    category: best.category || "Khác",
    readingTime: best.readingTime || 1,
  }
}

export async function runMoAFusion(
  articleText: string,
  website: string | undefined,
  config: MoAConfig,
  deps: MoADependencies = defaultDeps,
): Promise<MoAFusionResult> {
  logger.addLog("moa-fusion", "start", {
    proposers: config.proposers.map(p => p.model_name),
    aggregator: config.aggregator.model_name,
    articleLength: articleText.length,
    timeoutMs: config.proposerTimeoutMs,
    minSuccessfulDrafts: config.minSuccessfulDrafts,
  })

  // ── Layer 1 — Proposers (parallel) ─────────────────────────────────────
  const draftResults = await Promise.all(
    config.proposers.map(model =>
      runProposer(articleText, website, model, config.proposerTimeoutMs, deps),
    ),
  )

  const successfulDrafts = draftResults.filter(d => d.status === "success")
  const failedProposers = draftResults
    .filter(d => d.status !== "success")
    .map(d => d.model_name)

  logger.addLog("moa-fusion", "proposers-complete", {
    successful: successfulDrafts.length,
    failed: failedProposers,
  })

  if (successfulDrafts.length < config.minSuccessfulDrafts) {
    throw new MoAInsufficientDraftsError(
      successfulDrafts.length,
      config.minSuccessfulDrafts,
      failedProposers,
    )
  }

  // ── Layer 2 — Aggregator ───────────────────────────────────────────────
  const aggregatorPrompt = buildAggregatorPrompt(
    articleText,
    successfulDrafts.map(d => ({ model_name: d.model_name, summary: d.summary })),
  )

  const fallbackData = pickFallbackSummary(draftResults)
  const aggregatorStart = performance.now()
  const aggregatorResult = await deps.generateJsonCompletion<SummaryData>(
    {
      prompt: aggregatorPrompt,
      schema: SummaryDataSchema,
      provider: config.aggregator.provider,
      model: config.aggregator.model_name,
      modelType: config.aggregator.model_type,
      temperature: config.aggregator.temperature,
      topP: config.aggregator.top_p ?? undefined,
      topK: config.aggregator.top_k ?? undefined,
      maxTokens: config.aggregator.max_tokens ?? undefined,
      frequencyPenalty: config.aggregator.frequency_penalty ?? undefined,
      presencePenalty: config.aggregator.presence_penalty ?? undefined,
      seed: config.aggregator.seed ?? undefined,
      logContext: "moa-aggregator",
    },
    fallbackData,
  )
  const aggregatorLatencyMs = Math.round(performance.now() - aggregatorStart)

  const aggregatorPromptTokens = aggregatorResult.usage?.prompt_tokens ?? null
  const aggregatorCompletionTokens = aggregatorResult.usage?.completion_tokens ?? null
  const aggregatorCost = computeEstimatedCost(
    config.aggregator,
    aggregatorPromptTokens,
    aggregatorCompletionTokens,
  )

  logger.addLog("moa-fusion", "aggregator-complete", {
    model: config.aggregator.model_name,
    latencyMs: aggregatorLatencyMs,
    usage: aggregatorResult.usage,
  })

  // ── Evaluation (optional) ──────────────────────────────────────────────
  let fusedScores = emptyScores()
  let scoredDrafts: MoAScoredDraft[] = draftResults.map(d => ({ ...d, scores: emptyScores() }))

  if (config.includeEvaluation) {
    const [fScores, perDraftScores] = await Promise.all([
      deps.scoreSummary(aggregatorResult.data.summary, articleText),
      Promise.all(
        draftResults.map(async draft =>
          draft.status === "success"
            ? await deps.scoreSummary(draft.summary, articleText)
            : emptyScores(),
        ),
      ),
    ])
    fusedScores = fScores
    scoredDrafts = draftResults.map((d, i) => ({ ...d, scores: perDraftScores[i] }))
  }

  // ── Pick best draft via LLM judge (AlpacaEval-aligned) ─────────────────
  // Uses an N-way ranker judge to select the strongest draft by GPT-4
  // preference, matching the paper's methodology. Falls back to metric-based
  // selection (BERTScore/ROUGE) if the judge is unavailable.
  const bestDraft = await pickBestDraftByJudge(
    scoredDrafts,
    articleText,
    config.judgeOverride,
  )

  // ── Pairwise judge (fused vs best-draft) ───────────────────────────────
  // Always run when at least one draft succeeded; the helper returns null
  // when the resolved judge_mode is `metrics_only`. Errors are swallowed
  // inside the helper so they cannot break the MoA pipeline.
  let judgePairwiseResult: MoAJudgePairwiseResult | null = null
  if (bestDraft) {
    judgePairwiseResult = await deps.runFusionPairwiseJudge({
      fusedSummary: aggregatorResult.data.summary,
      bestDraft,
      articleText,
      override: config.judgeOverride,
    })
  }

  // ── Pipeline totals ────────────────────────────────────────────────────
  const maxProposerLatency = draftResults.reduce(
    (max, d) => (d.latency_ms > max ? d.latency_ms : max),
    0,
  )
  const totalLatencyMs = maxProposerLatency + aggregatorLatencyMs

  const proposerCostKnown = draftResults.every(d =>
    d.status !== "success" ? true : d.estimated_cost_usd !== null,
  )
  const aggregatorCostKnown = aggregatorCost !== null
  const totalCostUsd =
    proposerCostKnown && aggregatorCostKnown
      ? draftResults.reduce((sum, d) => sum + (d.estimated_cost_usd ?? 0), 0) +
        (aggregatorCost ?? 0)
      : null

  const proposerTokensKnown = draftResults.every(d =>
    d.status !== "success"
      ? true
      : d.prompt_tokens !== null && d.completion_tokens !== null,
  )
  const aggregatorTokensKnown =
    aggregatorPromptTokens !== null && aggregatorCompletionTokens !== null
  const totalTokens =
    proposerTokensKnown && aggregatorTokensKnown
      ? draftResults.reduce(
          (sum, d) => sum + (d.prompt_tokens ?? 0) + (d.completion_tokens ?? 0),
          0,
        ) +
        (aggregatorPromptTokens ?? 0) +
        (aggregatorCompletionTokens ?? 0)
      : null

  const result: MoAFusionResult = {
    fused: {
      summary: aggregatorResult.data.summary,
      category: aggregatorResult.data.category,
      readingTime: aggregatorResult.data.readingTime,
      scores: fusedScores,
    },
    drafts: scoredDrafts,
    aggregator: {
      model_name: config.aggregator.model_name,
      provider: config.aggregator.provider,
      latency_ms: aggregatorLatencyMs,
      prompt_tokens: aggregatorPromptTokens,
      completion_tokens: aggregatorCompletionTokens,
      estimated_cost_usd: aggregatorCost,
    },
    pipeline: {
      total_latency_ms: totalLatencyMs,
      total_cost_usd: totalCostUsd,
      total_tokens: totalTokens,
      proposer_count: config.proposers.length,
      successful_proposers: successfulDrafts.length,
      failed_proposers: failedProposers,
    },
    judge_pairwise: judgePairwiseResult,
  }

  logger.addLog("moa-fusion", "complete", {
    totalLatencyMs,
    totalCostUsd,
    successful: successfulDrafts.length,
    failed: failedProposers.length,
  })

  return result
}

function emptyScores(): MoAScores {
  return {
    rouge1: null,
    rouge2: null,
    rougeL: null,
    bleu: null,
    bert_score: null,
    compression_rate: null,
  }
}
