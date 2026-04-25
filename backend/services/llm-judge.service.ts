import { z } from "zod"
import { generateJsonCompletion as defaultGenerateJsonCompletion } from "@/services/llm.service"
import {
  JudgeRubricResultSchema,
  JudgeAbsoluteResultSchema,
  JudgePairwiseResultSchema,
  JudgeRankerResultSchema,
  type JudgeRubricResult,
  type JudgeAbsoluteResult,
  type JudgePairwiseResult,
  type JudgeRankerResult,
  type JudgeVerdict,
  type JudgePairwiseDimensions,
} from "@/domain/schemas"
import type {
  ModelConfig,
  LLMCompletionOptions,
  LLMCompletionResult,
} from "@/domain/types"

// ────────────────────────────────────────────────────────────────────────────
// Dependency injection — tests pass a fake `generateJsonCompletion` and a
// deterministic `random` so position-randomization can be asserted.
// ────────────────────────────────────────────────────────────────────────────

export type GenerateJsonCompletionFn = <T>(
  options: LLMCompletionOptions & { schema: z.ZodSchema<T> },
  fallback: T,
) => Promise<LLMCompletionResult<T>>

export interface JudgeDeps {
  generateJsonCompletion: GenerateJsonCompletionFn
  random: () => number
}

const defaultDeps: JudgeDeps = {
  generateJsonCompletion: defaultGenerateJsonCompletion,
  random: Math.random,
}

export interface JudgeOptions {
  model: ModelConfig
  logContext?: string
  deps?: Partial<JudgeDeps>
}

// ────────────────────────────────────────────────────────────────────────────
// Result types — wrap schema results with cost/latency/model bookkeeping.
// ────────────────────────────────────────────────────────────────────────────

export interface JudgeRubricServiceResult extends JudgeRubricResult {
  judge_model: string
  cost_usd: number | null
  latency_ms: number
}

export interface JudgeAbsoluteServiceResult extends JudgeAbsoluteResult {
  judge_model: string
  cost_usd: number | null
  latency_ms: number
}

export interface JudgePairwiseServiceResult {
  winner: JudgeVerdict
  winner_label: string
  per_dimension: JudgePairwiseDimensions
  justification: string
  length_note: string
  judge_model: string
  cost_usd: number | null
  latency_ms: number
  position_swapped: boolean
}

export interface JudgeRankerServiceResult extends JudgeRankerResult {
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

function flipVerdict(v: JudgeVerdict): JudgeVerdict {
  if (v === "tie") return "tie"
  return v === "A" ? "B" : "A"
}

// ────────────────────────────────────────────────────────────────────────────
// Prompts
// ────────────────────────────────────────────────────────────────────────────

function buildRubricPrompt(summary: string, sourceArticle: string): string {
  return `Bạn là biên tập viên báo chí kỳ cựu, đánh giá chất lượng bản tóm tắt một bài báo tiếng Việt.

Hãy chấm điểm bản TÓM TẮT bên dưới so với BÀI BÁO GỐC theo 5 tiêu chí, mỗi tiêu chí từ 1 đến 5 (1 = rất kém, 5 = xuất sắc):

- faithfulness: không có thông tin bịa đặt; mọi luận điểm đều có thể tra ra từ bài gốc.
- coverage: bao quát các điểm chính của bài.
- fluency: tiếng Việt tự nhiên, ngữ pháp đúng.
- conciseness: không có chi tiết dư thừa, không lặp ý.
- overall: đánh giá tổng quan.

Trả về JSON đúng định dạng:
{
  "scores": { "faithfulness": <int 1-5>, "coverage": <int 1-5>, "fluency": <int 1-5>, "conciseness": <int 1-5>, "overall": <int 1-5> },
  "justification": "Một câu ngắn (≤ 80 từ) giải thích cốt lõi của đánh giá."
}

BÀI BÁO GỐC:
"""
${sourceArticle}
"""

BẢN TÓM TẮT:
"""
${summary}
"""`
}

function buildAbsolutePrompt(summary: string, sourceArticle: string): string {
  return `Bạn là biên tập viên báo chí kỳ cựu, chấm điểm tổng quan một bản tóm tắt tin tức tiếng Việt theo phong cách MT-Bench.

Hãy chấm BẢN TÓM TẮT một điểm duy nhất từ 1 đến 10 thể hiện chất lượng tổng quan (1 = rất kém, 10 = xuất sắc), cân nhắc đầy đủ tính chính xác (so với BÀI BÁO GỐC), độ bao quát, sự trôi chảy và tính cô đọng.

Trả về JSON đúng định dạng:
{
  "score": <int 1-10>,
  "justification": "Một câu ngắn (≤ 80 từ) lý giải điểm số."
}

BÀI BÁO GỐC:
"""
${sourceArticle}
"""

BẢN TÓM TẮT:
"""
${summary}
"""`
}

function buildPairwisePrompt(
  positionA: { label: string; text: string },
  positionB: { label: string; text: string },
  sourceArticle: string,
): string {
  return `Bạn là biên tập viên báo chí kỳ cựu, so sánh hai bản tóm tắt của cùng một bài báo tiếng Việt theo phong cách AlpacaEval.

So sánh BẢN A và BẢN B; chọn bản nào CHẤT LƯỢNG HƠN cho người đọc tin tức Việt Nam, hoặc "tie" nếu hai bản tương đương.

QUY TẮC:
- Đừng phạt một bản chỉ vì nó ngắn hơn — chỉ phạt khi bản ngắn bỏ sót điểm chính.
- Đừng để vị trí A/B ảnh hưởng đến quyết định.
- Mỗi tiêu chí phụ ("faithfulness", "coverage", "fluency", "conciseness") cũng chấm A / B / tie.

Trả về JSON đúng định dạng:
{
  "winner": "A" | "B" | "tie",
  "per_dimension": {
    "faithfulness": "A" | "B" | "tie",
    "coverage":     "A" | "B" | "tie",
    "fluency":      "A" | "B" | "tie",
    "conciseness":  "A" | "B" | "tie"
  },
  "justification": "Một câu ngắn (≤ 80 từ) giải thích vì sao chọn bản đó.",
  "length_note":   "Một câu ngắn ghi chú nếu yếu tố độ dài có ảnh hưởng đến quyết định."
}

BÀI BÁO GỐC:
"""
${sourceArticle}
"""

BẢN A:
"""
${positionA.text}
"""

BẢN B:
"""
${positionB.text}
"""`
}

function buildRankerPrompt(
  candidates: Array<{ label: string; text: string }>,
  sourceArticle: string,
): string {
  const labelList = candidates.map(c => `"${c.label}"`).join(", ")
  const blocks = candidates
    .map(
      (c, i) =>
        `BẢN ${i + 1} (label: ${c.label}):\n"""\n${c.text}\n"""`,
    )
    .join("\n\n")
  return `Bạn là biên tập viên báo chí, sắp xếp các bản tóm tắt sau theo CHẤT LƯỢNG TỔNG QUAN từ tốt nhất đến kém nhất (xét tính chính xác, độ bao quát, sự trôi chảy, tính cô đọng).

Trả về JSON đúng định dạng:
{
  "ranking": <mảng các label theo thứ tự tốt → kém, ví dụ [${labelList}]>,
  "justification": "Một câu ngắn (≤ 80 từ) giải thích thứ tự xếp hạng."
}

BÀI BÁO GỐC:
"""
${sourceArticle}
"""

${blocks}`
}

// ────────────────────────────────────────────────────────────────────────────
// Fallbacks (used when the LLM call hard-fails or returns invalid JSON)
// ────────────────────────────────────────────────────────────────────────────

const RUBRIC_FALLBACK: JudgeRubricResult = {
  scores: { faithfulness: 1, coverage: 1, fluency: 1, conciseness: 1, overall: 1 },
  justification: "Judge call failed; default fallback applied.",
}

const ABSOLUTE_FALLBACK: JudgeAbsoluteResult = {
  score: 1,
  justification: "Judge call failed; default fallback applied.",
}

const PAIRWISE_FALLBACK: JudgePairwiseResult = {
  winner: "tie",
  per_dimension: { faithfulness: "tie", coverage: "tie", fluency: "tie", conciseness: "tie" },
  justification: "Judge call failed; default fallback applied.",
  length_note: "",
}

const RANKER_FALLBACK: JudgeRankerResult = {
  ranking: [],
  justification: "Judge call failed; default fallback applied.",
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

export async function judgeRubric(
  summary: string,
  sourceArticle: string,
  opts: JudgeOptions,
): Promise<JudgeRubricServiceResult> {
  const deps: JudgeDeps = { ...defaultDeps, ...opts.deps }
  const startTime = performance.now()
  const result = await deps.generateJsonCompletion(
    {
      ...buildLLMOptions(opts.model),
      prompt: buildRubricPrompt(summary, sourceArticle),
      schema: JudgeRubricResultSchema,
      logContext: opts.logContext ?? "llm-judge-rubric",
    },
    RUBRIC_FALLBACK,
  )
  return {
    ...result.data,
    judge_model: result.model,
    cost_usd: computeEstimatedCost(
      opts.model,
      result.usage?.prompt_tokens,
      result.usage?.completion_tokens,
    ),
    latency_ms: Math.round(performance.now() - startTime),
  }
}

export async function judgeAbsolute(
  summary: string,
  sourceArticle: string,
  opts: JudgeOptions,
): Promise<JudgeAbsoluteServiceResult> {
  const deps: JudgeDeps = { ...defaultDeps, ...opts.deps }
  const startTime = performance.now()
  const result = await deps.generateJsonCompletion(
    {
      ...buildLLMOptions(opts.model),
      prompt: buildAbsolutePrompt(summary, sourceArticle),
      schema: JudgeAbsoluteResultSchema,
      logContext: opts.logContext ?? "llm-judge-absolute",
    },
    ABSOLUTE_FALLBACK,
  )
  return {
    ...result.data,
    judge_model: result.model,
    cost_usd: computeEstimatedCost(
      opts.model,
      result.usage?.prompt_tokens,
      result.usage?.completion_tokens,
    ),
    latency_ms: Math.round(performance.now() - startTime),
  }
}

/**
 * Pairwise preference judgment (AlpacaEval-style).
 *
 * Position randomization: caller passes `a` and `b` in their canonical order
 * (e.g., a = fused, b = best-draft). Internally we may swap the two before
 * presenting them to the judge so that "A" and "B" inside the prompt are not
 * deterministically tied to the caller's a/b. The returned `winner` is mapped
 * back to the caller's a/b convention — `winner === "A"` always means the
 * caller's `a` won.
 */
export async function judgePairwise(
  a: { label: string; text: string },
  b: { label: string; text: string },
  sourceArticle: string,
  opts: JudgeOptions,
): Promise<JudgePairwiseServiceResult> {
  const deps: JudgeDeps = { ...defaultDeps, ...opts.deps }
  const swap = deps.random() < 0.5
  const positionA = swap ? b : a
  const positionB = swap ? a : b

  const startTime = performance.now()
  const result = await deps.generateJsonCompletion(
    {
      ...buildLLMOptions(opts.model),
      prompt: buildPairwisePrompt(positionA, positionB, sourceArticle),
      schema: JudgePairwiseResultSchema,
      logContext: opts.logContext ?? "llm-judge-pairwise",
    },
    PAIRWISE_FALLBACK,
  )
  const latencyMs = Math.round(performance.now() - startTime)

  const callerWinner: JudgeVerdict = swap
    ? flipVerdict(result.data.winner)
    : result.data.winner
  const winnerLabel =
    callerWinner === "tie" ? "tie" : callerWinner === "A" ? a.label : b.label

  const perDimRaw = result.data.per_dimension
  const perDimension: JudgePairwiseDimensions = swap
    ? {
        faithfulness: flipVerdict(perDimRaw.faithfulness),
        coverage: flipVerdict(perDimRaw.coverage),
        fluency: flipVerdict(perDimRaw.fluency),
        conciseness: flipVerdict(perDimRaw.conciseness),
      }
    : perDimRaw

  return {
    winner: callerWinner,
    winner_label: winnerLabel,
    per_dimension: perDimension,
    justification: result.data.justification,
    length_note: result.data.length_note,
    judge_model: result.model,
    cost_usd: computeEstimatedCost(
      opts.model,
      result.usage?.prompt_tokens,
      result.usage?.completion_tokens,
    ),
    latency_ms: latencyMs,
    position_swapped: swap,
  }
}

export async function judgeNWayRanker(
  candidates: Array<{ label: string; text: string }>,
  sourceArticle: string,
  opts: JudgeOptions,
): Promise<JudgeRankerServiceResult> {
  if (candidates.length < 2) {
    throw new Error("judgeNWayRanker requires at least 2 candidates")
  }
  const deps: JudgeDeps = { ...defaultDeps, ...opts.deps }
  const startTime = performance.now()
  const result = await deps.generateJsonCompletion(
    {
      ...buildLLMOptions(opts.model),
      prompt: buildRankerPrompt(candidates, sourceArticle),
      schema: JudgeRankerResultSchema,
      logContext: opts.logContext ?? "llm-judge-ranker",
    },
    RANKER_FALLBACK,
  )
  return {
    ...result.data,
    judge_model: result.model,
    cost_usd: computeEstimatedCost(
      opts.model,
      result.usage?.prompt_tokens,
      result.usage?.completion_tokens,
    ),
    latency_ms: Math.round(performance.now() - startTime),
  }
}

// Exported for unit tests
export const __test__ = {
  buildRubricPrompt,
  buildAbsolutePrompt,
  buildPairwisePrompt,
  buildRankerPrompt,
  flipVerdict,
  computeEstimatedCost,
}
