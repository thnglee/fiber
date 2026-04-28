import { z } from "zod"
import { generateJsonCompletion as defaultGenerateJsonCompletion } from "@/services/llm.service"
import {
  FactualityClaimListSchema,
  FactualityVerdictListSchema,
  type FactualityResult,
} from "@/domain/schemas"
import type {
  ModelConfig,
  LLMCompletionOptions,
  LLMCompletionResult,
} from "@/domain/types"

// ────────────────────────────────────────────────────────────────────────────
// Dependency injection — tests inject a fake `generateJsonCompletion`.
// ────────────────────────────────────────────────────────────────────────────

export type GenerateJsonCompletionFn = <T>(
  options: LLMCompletionOptions & { schema: z.ZodSchema<T> },
  fallback: T,
) => Promise<LLMCompletionResult<T>>

export interface FactualityDeps {
  generateJsonCompletion: GenerateJsonCompletionFn
}

const defaultDeps: FactualityDeps = {
  generateJsonCompletion: defaultGenerateJsonCompletion,
}

export interface FactualityOptions {
  model: ModelConfig
  logContext?: string
  deps?: Partial<FactualityDeps>
}

export interface FactualityServiceResult extends FactualityResult {
  judge_model: string
  cost_usd: number | null
  latency_ms: number
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function computeEstimatedCost(
  model: ModelConfig,
  promptTokens: number | undefined,
  completionTokens: number | undefined,
): number | null {
  if (model.input_cost_per_1m == null) return null
  const inputCost = ((promptTokens ?? 0) / 1_000_000) * model.input_cost_per_1m
  const outputCost = ((completionTokens ?? 0) / 1_000_000) * (model.output_cost_per_1m ?? 0)
  return inputCost + outputCost
}

function buildLLMOptions(model: ModelConfig): Partial<LLMCompletionOptions> {
  return {
    provider: model.provider,
    model: model.model_name,
    modelType: model.model_type,
    temperature: model.temperature,
    topP: model.top_p ?? undefined,
    topK: model.top_k ?? undefined,
    maxTokens: model.max_tokens ?? undefined,
    frequencyPenalty: model.frequency_penalty ?? undefined,
    presencePenalty: model.presence_penalty ?? undefined,
    seed: model.seed ?? undefined,
  }
}

function sumCosts(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null
  return (a ?? 0) + (b ?? 0)
}

// ────────────────────────────────────────────────────────────────────────────
// Prompts
// ────────────────────────────────────────────────────────────────────────────

function buildClaimSplitPrompt(summary: string): string {
  return `Bạn là biên tập viên báo chí, tách bản TÓM TẮT bên dưới thành các luận điểm nguyên tử (atomic claims) — mỗi luận điểm là một mệnh đề đơn lẻ có thể được kiểm chứng độc lập.

QUY TẮC:
- Mỗi luận điểm là MỘT câu khẳng định cụ thể (không quá 25 từ).
- Bỏ qua các câu mở/kết mang tính tu từ.
- Tối đa 20 luận điểm.

Trả về JSON đúng định dạng:
{
  "claims": [
    { "claim": "..." },
    ...
  ]
}

BẢN TÓM TẮT:
"""
${summary}
"""`
}

function buildEntailmentPrompt(
  claims: Array<{ claim: string }>,
  sourceArticle: string,
): string {
  const numbered = claims
    .map((c, i) => `${i + 1}. ${c.claim}`)
    .join("\n")
  return `Bạn là kiểm chứng viên báo chí. Cho BÀI BÁO GỐC và DANH SÁCH LUẬN ĐIỂM trích từ một bản tóm tắt, đánh giá từng luận điểm theo một trong ba nhãn:

- "entailed":      luận điểm có thể tra cứu/đối chiếu được trong bài gốc.
- "contradicted":  luận điểm mâu thuẫn với bài gốc.
- "not_mentioned": bài gốc không nói gì về luận điểm này.

Trả về JSON đúng định dạng:
{
  "verdicts": [
    { "claim": "<lặp lại câu luận điểm>", "verdict": "entailed" | "contradicted" | "not_mentioned", "reason": "Một câu ngắn ≤ 30 từ giải thích quyết định." },
    ...
  ]
}

QUY TẮC:
- "verdicts" phải có đúng ${claims.length} phần tử, theo đúng thứ tự danh sách bên dưới.
- "reason" phải ngắn gọn, không trích dẫn dài.

BÀI BÁO GỐC:
"""
${sourceArticle}
"""

DANH SÁCH LUẬN ĐIỂM:
${numbered}`
}

// ────────────────────────────────────────────────────────────────────────────
// Fallbacks
// ────────────────────────────────────────────────────────────────────────────

const CLAIM_LIST_FALLBACK = { claims: [] as Array<{ claim: string }> }
const VERDICT_LIST_FALLBACK = {
  verdicts: [] as Array<{
    claim: string
    verdict: "entailed" | "contradicted" | "not_mentioned"
    reason: string
  }>,
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

/**
 * Score a summary's factual grounding against the source article.
 *
 * Two LLM calls:
 *   1. Split the summary into atomic claims.
 *   2. Classify each claim as entailed / contradicted / not_mentioned.
 *
 * Returns ratio of entailed claims plus separate lists of contradictions and
 * not-mentioned items. The ratio is computed against the total of returned
 * verdicts; if no claims were extracted, the ratio is 1.0 (vacuously true).
 */
export async function scoreFactuality(
  summary: string,
  sourceArticle: string,
  opts: FactualityOptions,
): Promise<FactualityServiceResult> {
  const deps: FactualityDeps = { ...defaultDeps, ...opts.deps }
  const startTime = performance.now()

  // ── Step 1 — claim splitting ──
  const claimsResult = await deps.generateJsonCompletion(
    {
      ...buildLLMOptions(opts.model),
      prompt: buildClaimSplitPrompt(summary),
      schema: FactualityClaimListSchema,
      logContext: opts.logContext ?? "factuality-claim-split",
    },
    CLAIM_LIST_FALLBACK,
  )

  const claims = claimsResult.data.claims

  if (claims.length === 0) {
    // Vacuously faithful — no claims were extracted.
    return {
      total_claims: 0,
      entailed_claims: 0,
      entailed_ratio: 1,
      hallucinations: [],
      not_mentioned: [],
      judge_model: claimsResult.model,
      cost_usd: computeEstimatedCost(
        opts.model,
        claimsResult.usage?.prompt_tokens,
        claimsResult.usage?.completion_tokens,
      ),
      latency_ms: Math.round(performance.now() - startTime),
    }
  }

  // ── Step 2 — entailment ──
  const verdictResult = await deps.generateJsonCompletion(
    {
      ...buildLLMOptions(opts.model),
      prompt: buildEntailmentPrompt(claims, sourceArticle),
      schema: FactualityVerdictListSchema,
      logContext: opts.logContext ?? "factuality-entailment",
    },
    VERDICT_LIST_FALLBACK,
  )

  const verdicts = verdictResult.data.verdicts
  const total = verdicts.length
  const entailed = verdicts.filter(v => v.verdict === "entailed").length
  const hallucinations = verdicts
    .filter(v => v.verdict === "contradicted")
    .map(v => ({ claim: v.claim, reason: v.reason }))
  const notMentioned = verdicts
    .filter(v => v.verdict === "not_mentioned")
    .map(v => ({ claim: v.claim, reason: v.reason }))

  const ratio = total > 0 ? entailed / total : 1

  const cost = sumCosts(
    computeEstimatedCost(
      opts.model,
      claimsResult.usage?.prompt_tokens,
      claimsResult.usage?.completion_tokens,
    ),
    computeEstimatedCost(
      opts.model,
      verdictResult.usage?.prompt_tokens,
      verdictResult.usage?.completion_tokens,
    ),
  )

  return {
    total_claims: total,
    entailed_claims: entailed,
    entailed_ratio: ratio,
    hallucinations,
    not_mentioned: notMentioned,
    judge_model: verdictResult.model,
    cost_usd: cost,
    latency_ms: Math.round(performance.now() - startTime),
  }
}

// Exported for unit tests
export const __test__ = {
  buildClaimSplitPrompt,
  buildEntailmentPrompt,
  computeEstimatedCost,
  sumCosts,
}
