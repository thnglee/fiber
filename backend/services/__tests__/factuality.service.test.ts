import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { z } from "zod"

import type {
  LLMCompletionOptions,
  LLMCompletionResult,
  ModelConfig,
} from "@/domain/types"
import {
  scoreFactuality,
  __test__,
  type GenerateJsonCompletionFn,
} from "../factuality.service"

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makeModel(overrides?: Partial<ModelConfig>): ModelConfig {
  return {
    id: "test-factuality-model",
    provider: "openai",
    model_name: "gpt-4o-mini",
    display_name: "GPT-4o-mini",
    model_type: "standard",
    is_active: false,
    temperature: 0.2,
    top_p: null,
    top_k: null,
    max_tokens: null,
    min_tokens: null,
    frequency_penalty: null,
    presence_penalty: null,
    seed: null,
    context_window: 128_000,
    supports_streaming: true,
    supports_structured_output: true,
    supports_temperature: true,
    input_cost_per_1m: 0.15,
    output_cost_per_1m: 0.6,
    ...overrides,
  }
}

const ARTICLE = "Hôm nay thời tiết Hà Nội nắng đẹp, nhiệt độ 28 độ C. Theo dự báo, ngày mai có mưa rào."
const SUMMARY = "Hà Nội nắng đẹp, 28 độ. Ngày mai mưa rào. Sao Hỏa hôm nay rất nóng."

/**
 * Build a fake `generateJsonCompletion` whose payload is selected by the
 * presence of "claims" vs "verdicts" in the requested schema (the only two
 * shapes scoreFactuality issues).
 */
function makeFake(payloads: {
  claims?: unknown
  verdicts?: unknown
  promptTokens?: number
  completionTokens?: number
  modelName?: string
}): GenerateJsonCompletionFn {
  let callCount = 0
  return (async (
    options: LLMCompletionOptions & { schema: z.ZodSchema<unknown> },
    fallback: unknown,
  ): Promise<LLMCompletionResult<unknown>> => {
    callCount++
    const isClaimSchema = options.prompt.includes("luận điểm nguyên tử")
    const data = isClaimSchema ? payloads.claims ?? fallback : payloads.verdicts ?? fallback
    return {
      data,
      rawResponse: JSON.stringify(data),
      model: payloads.modelName ?? "gpt-4o-mini-2024-07-18",
      usage: {
        prompt_tokens: payloads.promptTokens ?? 1000,
        completion_tokens: payloads.completionTokens ?? 100,
        total_tokens: (payloads.promptTokens ?? 1000) + (payloads.completionTokens ?? 100),
      },
    }
  }) as GenerateJsonCompletionFn
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("scoreFactuality", () => {
  it("returns ratio = 1.0 with empty lists when no claims are extracted", async () => {
    const result = await scoreFactuality(SUMMARY, ARTICLE, {
      model: makeModel(),
      deps: {
        generateJsonCompletion: makeFake({ claims: { claims: [] } }),
      },
    })
    assert.equal(result.total_claims, 0)
    assert.equal(result.entailed_claims, 0)
    assert.equal(result.entailed_ratio, 1)
    assert.deepEqual(result.hallucinations, [])
    assert.deepEqual(result.not_mentioned, [])
    // Cost should reflect the single (claim-split) call only.
    assert.ok(result.cost_usd != null && result.cost_usd > 0)
  })

  it("computes ratio + bucketing across mixed verdicts", async () => {
    const claimsPayload = {
      claims: [
        { claim: "Hà Nội nắng đẹp." },
        { claim: "Nhiệt độ 28 độ." },
        { claim: "Ngày mai mưa rào." },
        { claim: "Sao Hỏa hôm nay rất nóng." },
      ],
    }
    const verdictsPayload = {
      verdicts: [
        { claim: "Hà Nội nắng đẹp.", verdict: "entailed", reason: "Khớp với câu mở bài." },
        { claim: "Nhiệt độ 28 độ.", verdict: "entailed", reason: "Có trong bài gốc." },
        { claim: "Ngày mai mưa rào.", verdict: "entailed", reason: "Theo dự báo." },
        { claim: "Sao Hỏa hôm nay rất nóng.", verdict: "not_mentioned", reason: "Bài gốc không nhắc đến Sao Hỏa." },
      ],
    }

    const result = await scoreFactuality(SUMMARY, ARTICLE, {
      model: makeModel(),
      deps: {
        generateJsonCompletion: makeFake({
          claims: claimsPayload,
          verdicts: verdictsPayload,
        }),
      },
    })

    assert.equal(result.total_claims, 4)
    assert.equal(result.entailed_claims, 3)
    assert.ok(Math.abs(result.entailed_ratio - 0.75) < 1e-9)
    assert.equal(result.hallucinations.length, 0)
    assert.equal(result.not_mentioned.length, 1)
    assert.equal(result.not_mentioned[0].claim, "Sao Hỏa hôm nay rất nóng.")
  })

  it("captures contradictions distinctly from not_mentioned", async () => {
    const claimsPayload = {
      claims: [
        { claim: "Hà Nội mưa to cả ngày." },
        { claim: "Nhiệt độ -5 độ." },
      ],
    }
    const verdictsPayload = {
      verdicts: [
        { claim: "Hà Nội mưa to cả ngày.", verdict: "contradicted", reason: "Bài nói nắng đẹp." },
        { claim: "Nhiệt độ -5 độ.", verdict: "contradicted", reason: "Bài nói 28 độ." },
      ],
    }
    const result = await scoreFactuality(SUMMARY, ARTICLE, {
      model: makeModel(),
      deps: {
        generateJsonCompletion: makeFake({
          claims: claimsPayload,
          verdicts: verdictsPayload,
        }),
      },
    })
    assert.equal(result.total_claims, 2)
    assert.equal(result.entailed_claims, 0)
    assert.equal(result.entailed_ratio, 0)
    assert.equal(result.hallucinations.length, 2)
    assert.equal(result.not_mentioned.length, 0)
  })

  it("returns null cost when model has no input pricing", async () => {
    const result = await scoreFactuality(SUMMARY, ARTICLE, {
      model: makeModel({ input_cost_per_1m: null, output_cost_per_1m: null }),
      deps: {
        generateJsonCompletion: makeFake({
          claims: { claims: [{ claim: "x" }] },
          verdicts: {
            verdicts: [{ claim: "x", verdict: "entailed", reason: "ok" }],
          },
        }),
      },
    })
    assert.equal(result.cost_usd, null)
  })

  it("sums cost across both calls when model has pricing", async () => {
    // 2 calls × ((1000/1e6)*0.15 + (100/1e6)*0.6) = 2 × (0.00015 + 0.00006) = 0.00042
    const result = await scoreFactuality(SUMMARY, ARTICLE, {
      model: makeModel(),
      deps: {
        generateJsonCompletion: makeFake({
          claims: { claims: [{ claim: "x" }] },
          verdicts: {
            verdicts: [{ claim: "x", verdict: "entailed", reason: "ok" }],
          },
        }),
      },
    })
    assert.ok(result.cost_usd != null)
    assert.ok(Math.abs(result.cost_usd! - 0.00042) < 1e-9)
  })

  it("populates judge_model + latency_ms", async () => {
    const result = await scoreFactuality(SUMMARY, ARTICLE, {
      model: makeModel(),
      deps: {
        generateJsonCompletion: makeFake({
          claims: { claims: [{ claim: "x" }] },
          verdicts: {
            verdicts: [{ claim: "x", verdict: "entailed", reason: "ok" }],
          },
          modelName: "gpt-4o-mini-fingerprint",
        }),
      },
    })
    assert.equal(result.judge_model, "gpt-4o-mini-fingerprint")
    assert.ok(typeof result.latency_ms === "number" && result.latency_ms >= 0)
  })
})

describe("internal helpers", () => {
  it("buildEntailmentPrompt embeds article + numbered claims", () => {
    const prompt = __test__.buildEntailmentPrompt(
      [{ claim: "Câu 1" }, { claim: "Câu 2" }],
      ARTICLE,
    )
    assert.match(prompt, /Câu 1/)
    assert.match(prompt, /Câu 2/)
    assert.ok(prompt.includes(ARTICLE))
    assert.match(prompt, /1\. Câu 1/)
    assert.match(prompt, /2\. Câu 2/)
  })

  it("sumCosts handles all-null, partial-null, and both-set", () => {
    assert.equal(__test__.sumCosts(null, null), null)
    assert.equal(__test__.sumCosts(0.1, null), 0.1)
    assert.equal(__test__.sumCosts(null, 0.2), 0.2)
    assert.ok(Math.abs(__test__.sumCosts(0.1, 0.2)! - 0.3) < 1e-9)
  })

  it("computeEstimatedCost returns null without input pricing", () => {
    const m = makeModel({ input_cost_per_1m: null })
    assert.equal(__test__.computeEstimatedCost(m, 1000, 100), null)
  })
})
