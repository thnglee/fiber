import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { z } from "zod"

import type {
  LLMCompletionOptions,
  LLMCompletionResult,
  ModelConfig,
} from "@/domain/types"
import {
  judgeRubric,
  judgeAbsolute,
  judgePairwise,
  judgeNWayRanker,
  __test__,
  type GenerateJsonCompletionFn,
} from "../llm-judge.service"

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makeModel(overrides?: Partial<ModelConfig>): ModelConfig {
  return {
    id: "test-judge-model",
    provider: "openai",
    model_name: "gpt-4o",
    display_name: "GPT-4o",
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
    input_cost_per_1m: 2.5,
    output_cost_per_1m: 10,
    ...overrides,
  }
}

const ARTICLE = "Hôm nay thời tiết Hà Nội nắng đẹp, nhiệt độ 28 độ C."
const SUMMARY_A = "Hà Nội nắng đẹp, 28 độ."
const SUMMARY_B = "Thời tiết Hà Nội hôm nay đẹp."

/** Build a fake `generateJsonCompletion` that returns whatever payload the test wants. */
function fakeCompletion<T>(
  payload: T,
  usage: { prompt_tokens?: number; completion_tokens?: number } = {
    prompt_tokens: 1000,
    completion_tokens: 100,
  },
  modelName = "gpt-4o-2024-08-06",
): GenerateJsonCompletionFn {
  return (async (
    _options: LLMCompletionOptions & { schema: z.ZodSchema<unknown> },
    _fallback: unknown,
  ): Promise<LLMCompletionResult<T>> => {
    return {
      data: payload,
      rawResponse: JSON.stringify(payload),
      model: modelName,
      usage: {
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        total_tokens: (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0),
      },
    }
  }) as GenerateJsonCompletionFn
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("judgeRubric", () => {
  it("returns scores, justification, model, cost, and latency", async () => {
    const result = await judgeRubric(SUMMARY_A, ARTICLE, {
      model: makeModel(),
      deps: {
        generateJsonCompletion: fakeCompletion({
          scores: { faithfulness: 5, coverage: 4, fluency: 5, conciseness: 4, overall: 5 },
          justification: "Bản tóm tắt chính xác và tự nhiên.",
        }),
      },
    })

    assert.equal(result.scores.faithfulness, 5)
    assert.equal(result.scores.overall, 5)
    assert.equal(result.justification, "Bản tóm tắt chính xác và tự nhiên.")
    assert.equal(result.judge_model, "gpt-4o-2024-08-06")
    assert.ok(result.cost_usd != null && result.cost_usd > 0)
    // (1000 / 1e6) * 2.5 + (100 / 1e6) * 10 = 0.0025 + 0.001 = 0.0035
    assert.ok(Math.abs(result.cost_usd! - 0.0035) < 1e-9)
    assert.ok(typeof result.latency_ms === "number" && result.latency_ms >= 0)
  })

  it("returns null cost when model has no pricing data", async () => {
    const result = await judgeRubric(SUMMARY_A, ARTICLE, {
      model: makeModel({ input_cost_per_1m: null, output_cost_per_1m: null }),
      deps: {
        generateJsonCompletion: fakeCompletion({
          scores: { faithfulness: 3, coverage: 3, fluency: 3, conciseness: 3, overall: 3 },
          justification: "OK.",
        }),
      },
    })
    assert.equal(result.cost_usd, null)
  })
})

describe("judgeAbsolute", () => {
  it("returns a 1-10 score with justification", async () => {
    const result = await judgeAbsolute(SUMMARY_A, ARTICLE, {
      model: makeModel(),
      deps: {
        generateJsonCompletion: fakeCompletion({
          score: 8,
          justification: "Tóm tắt tốt.",
        }),
      },
    })
    assert.equal(result.score, 8)
    assert.equal(result.justification, "Tóm tắt tốt.")
    assert.ok(result.cost_usd != null && result.cost_usd > 0)
  })
})

describe("judgePairwise — position randomization", () => {
  // The LLM always says "A wins". With swap=false, caller's a wins. With
  // swap=true, the LLM saw caller's b in position A, so the un-swapped
  // caller-winner must be B.
  const llmReturnsAWins = fakeCompletion({
    winner: "A",
    per_dimension: {
      faithfulness: "A",
      coverage: "tie",
      fluency: "B",
      conciseness: "A",
    },
    justification: "A is better.",
    length_note: "no length issue.",
  })

  it("does not swap when random() >= 0.5 — caller_winner echoes LLM verdict", async () => {
    const result = await judgePairwise(
      { label: "fused", text: SUMMARY_A },
      { label: "best_draft", text: SUMMARY_B },
      ARTICLE,
      {
        model: makeModel(),
        deps: { generateJsonCompletion: llmReturnsAWins, random: () => 0.7 },
      },
    )
    assert.equal(result.position_swapped, false)
    assert.equal(result.winner, "A")
    assert.equal(result.winner_label, "fused")
    assert.deepEqual(result.per_dimension, {
      faithfulness: "A",
      coverage: "tie",
      fluency: "B",
      conciseness: "A",
    })
  })

  it("swaps when random() < 0.5 and un-flips winner + per_dimension", async () => {
    const result = await judgePairwise(
      { label: "fused", text: SUMMARY_A },
      { label: "best_draft", text: SUMMARY_B },
      ARTICLE,
      {
        model: makeModel(),
        deps: { generateJsonCompletion: llmReturnsAWins, random: () => 0.3 },
      },
    )
    // Swap=true means LLM saw caller's `b` as A. LLM picked A → caller's `b` won.
    assert.equal(result.position_swapped, true)
    assert.equal(result.winner, "B")
    assert.equal(result.winner_label, "best_draft")
    // per_dimension is also flipped
    assert.deepEqual(result.per_dimension, {
      faithfulness: "B", // was A
      coverage: "tie",   // tie stays tie
      fluency: "A",      // was B
      conciseness: "B",  // was A
    })
  })

  it("preserves tie verdicts through swap", async () => {
    const tiePayload = fakeCompletion({
      winner: "tie",
      per_dimension: { faithfulness: "tie", coverage: "tie", fluency: "tie", conciseness: "tie" },
      justification: "Equivalent.",
      length_note: "",
    })
    const result = await judgePairwise(
      { label: "fused", text: SUMMARY_A },
      { label: "best_draft", text: SUMMARY_B },
      ARTICLE,
      {
        model: makeModel(),
        deps: { generateJsonCompletion: tiePayload, random: () => 0.1 },
      },
    )
    assert.equal(result.position_swapped, true)
    assert.equal(result.winner, "tie")
    assert.equal(result.winner_label, "tie")
  })
})

describe("judgeNWayRanker", () => {
  it("returns a ranking and rejects single-candidate input", async () => {
    await assert.rejects(
      () =>
        judgeNWayRanker([{ label: "only", text: SUMMARY_A }], ARTICLE, {
          model: makeModel(),
        }),
      /at least 2 candidates/,
    )

    const result = await judgeNWayRanker(
      [
        { label: "fused", text: SUMMARY_A },
        { label: "best_draft", text: SUMMARY_B },
      ],
      ARTICLE,
      {
        model: makeModel(),
        deps: {
          generateJsonCompletion: fakeCompletion({
            ranking: ["fused", "best_draft"],
            justification: "fused is more accurate.",
          }),
        },
      },
    )
    assert.deepEqual(result.ranking, ["fused", "best_draft"])
    assert.ok(result.cost_usd != null && result.cost_usd > 0)
  })
})

describe("internal helpers", () => {
  it("flipVerdict swaps A/B and preserves tie", () => {
    assert.equal(__test__.flipVerdict("A"), "B")
    assert.equal(__test__.flipVerdict("B"), "A")
    assert.equal(__test__.flipVerdict("tie"), "tie")
  })

  it("computeEstimatedCost returns null when model has no input pricing", () => {
    const m = makeModel({ input_cost_per_1m: null })
    assert.equal(__test__.computeEstimatedCost(m, 1000, 100), null)
  })

  it("computeEstimatedCost handles missing output pricing gracefully", () => {
    const m = makeModel({ input_cost_per_1m: 2, output_cost_per_1m: null })
    // (1000 / 1e6) * 2 + 0 = 0.002
    assert.ok(Math.abs(__test__.computeEstimatedCost(m, 1000, 100)! - 0.002) < 1e-9)
  })

  it("buildPairwisePrompt embeds both summaries and the source", () => {
    const prompt = __test__.buildPairwisePrompt(
      { label: "fused", text: "Bản X" },
      { label: "best", text: "Bản Y" },
      ARTICLE,
    )
    assert.match(prompt, /Bản X/)
    assert.match(prompt, /Bản Y/)
    assert.ok(prompt.includes(ARTICLE))
  })
})
