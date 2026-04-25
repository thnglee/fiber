import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { z } from "zod"

import type {
  LLMCompletionOptions,
  LLMCompletionResult,
  ModelConfig,
  SummarizeRequest,
  SummarizeResponse,
} from "@/domain/types"
import { SummaryDataSchema } from "@/domain/schemas"
import { runMoAFusion, type MoADependencies } from "../moa.service"
import {
  MoAInsufficientDraftsError,
  type MoAConfig,
  type MoAScores,
} from "../moa.types"
import { buildAggregatorPrompt } from "../moa.prompt"
import { compareFusedVsDrafts } from "../moa.evaluation"

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makeModel(overrides: Partial<ModelConfig> & { model_name: string }): ModelConfig {
  const base: ModelConfig = {
    id: overrides.model_name,
    provider: "openai",
    model_name: overrides.model_name,
    display_name: overrides.model_name,
    model_type: "standard",
    is_active: false,
    temperature: 0.3,
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
  }
  return { ...base, ...overrides }
}

const ARTICLE =
  "Hôm nay thời tiết Hà Nội nắng đẹp, nhiệt độ cao nhất khoảng 28 độ C. Dự báo ngày mai tiếp tục nắng nhẹ."

const emptyScores = (): MoAScores => ({
  rouge1: null,
  rouge2: null,
  rougeL: null,
  bleu: null,
  bert_score: null,
  compression_rate: null,
})

function makeDeps(overrides?: Partial<MoADependencies>): MoADependencies {
  const stubScore: MoADependencies["scoreSummary"] = async () => emptyScores()
  const stubPairwise: MoADependencies["runFusionPairwiseJudge"] = async () => null
  const defaultSummarize: MoADependencies["performSummarize"] = async (
    _req: SummarizeRequest,
    model?: ModelConfig,
  ): Promise<SummarizeResponse> => ({
    summary: `Bản tóm tắt từ ${model?.model_name ?? "unknown"}.`,
    category: "Khác",
    readingTime: 1,
    model: model?.model_name,
    usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
  })
  const defaultAggregate: MoADependencies["generateJsonCompletion"] = async <T>(
    options: LLMCompletionOptions & { schema: z.ZodSchema<T> },
  ): Promise<LLMCompletionResult<T>> => {
    const data = SummaryDataSchema.parse({
      summary: "Bản tóm tắt tổng hợp cuối cùng.",
      category: "Văn hóa - Giải trí",
      readingTime: 2,
    }) as unknown as T
    return {
      data,
      rawResponse: JSON.stringify(data),
      model: options.model ?? "aggregator",
      usage: { prompt_tokens: 500, completion_tokens: 80, total_tokens: 580 },
    }
  }
  return {
    runFusionPairwiseJudge: stubPairwise,
    performSummarize: defaultSummarize,
    generateJsonCompletion: defaultAggregate,
    scoreSummary: stubScore,
    ...overrides,
  }
}

function makeConfig(overrides?: Partial<MoAConfig>): MoAConfig {
  return {
    proposers: [
      makeModel({ model_name: "gpt-4o-mini" }),
      makeModel({ model_name: "gemini-2.0-flash-001", provider: "gemini" }),
      makeModel({ model_name: "claude-3-5-haiku", provider: "anthropic" }),
    ],
    aggregator: makeModel({ model_name: "gpt-4o" }),
    proposerTimeoutMs: 50,
    minSuccessfulDrafts: 2,
    includeEvaluation: false,
    ...overrides,
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("buildAggregatorPrompt", () => {
  it("includes the article and every draft labeled with its model name", () => {
    const prompt = buildAggregatorPrompt(ARTICLE, [
      { model_name: "gpt-4o-mini", summary: "Bản A" },
      { model_name: "gemini", summary: "Bản B" },
    ])
    assert.match(prompt, /gpt-4o-mini/)
    assert.match(prompt, /gemini/)
    assert.match(prompt, /Bản A/)
    assert.match(prompt, /Bản B/)
    assert.ok(prompt.includes(ARTICLE))
  })
})

describe("compareFusedVsDrafts", () => {
  const fused: MoAScores = {
    rouge1: 0.5,
    rouge2: 0.4,
    rougeL: 0.45,
    bleu: 0.3,
    bert_score: 0.8,
    compression_rate: 25,
  }
  const drafts = [
    { scores: { rouge1: 0.4, rouge2: 0.3, rougeL: 0.35, bleu: 0.2, bert_score: 0.75, compression_rate: 30 } },
    { scores: { rouge1: 0.45, rouge2: 0.35, rougeL: 0.4, bleu: 0.25, bert_score: 0.78, compression_rate: 28 } },
  ] as unknown as Parameters<typeof compareFusedVsDrafts>[1]

  it("marks higher-is-better metrics as improved when fused beats best single draft", () => {
    const result = compareFusedVsDrafts(fused, drafts)
    const rouge1 = result.find(r => r.metric === "rouge1")!
    assert.equal(rouge1.bestSingle, 0.45)
    assert.equal(rouge1.improved, true)
  })

  it("treats compression_rate as lower-is-better", () => {
    const result = compareFusedVsDrafts(fused, drafts)
    const cr = result.find(r => r.metric === "compression_rate")!
    assert.equal(cr.bestSingle, 28)
    assert.equal(cr.improved, true)
    assert.ok(cr.delta < 0)
  })
})

describe("runMoAFusion — happy path", () => {
  it("returns fused summary, draft list, aggregator metadata, and pipeline totals", async () => {
    const deps = makeDeps()
    const result = await runMoAFusion(ARTICLE, undefined, makeConfig(), deps)

    assert.equal(result.fused.summary, "Bản tóm tắt tổng hợp cuối cùng.")
    assert.equal(result.fused.category, "Văn hóa - Giải trí")
    assert.equal(result.fused.readingTime, 2)

    assert.equal(result.drafts.length, 3)
    assert.ok(result.drafts.every(d => d.status === "success"))

    assert.equal(result.aggregator.model_name, "gpt-4o")
    assert.equal(result.aggregator.prompt_tokens, 500)
    assert.equal(result.aggregator.completion_tokens, 80)

    assert.equal(result.pipeline.proposer_count, 3)
    assert.equal(result.pipeline.successful_proposers, 3)
    assert.deepEqual(result.pipeline.failed_proposers, [])
    assert.ok(result.pipeline.total_latency_ms >= 0)
    assert.equal(
      result.pipeline.total_tokens,
      100 * 3 + 20 * 3 + 500 + 80,
    )
  })

  it("propagates scores when evaluation is enabled", async () => {
    const fusedScores: MoAScores = {
      rouge1: 0.42,
      rouge2: 0.28,
      rougeL: 0.39,
      bleu: 0.2,
      bert_score: 0.82,
      compression_rate: 25,
    }
    const draftScores: MoAScores = {
      rouge1: 0.3,
      rouge2: 0.22,
      rougeL: 0.28,
      bleu: 0.15,
      bert_score: 0.78,
      compression_rate: 30,
    }
    const deps = makeDeps({
      scoreSummary: async summary =>
        summary === "Bản tóm tắt tổng hợp cuối cùng." ? fusedScores : draftScores,
    })
    const result = await runMoAFusion(
      ARTICLE,
      undefined,
      makeConfig({ includeEvaluation: true }),
      deps,
    )
    assert.deepEqual(result.fused.scores, fusedScores)
    for (const draft of result.drafts) {
      assert.deepEqual(draft.scores, draftScores)
    }
  })
})

describe("runMoAFusion — partial failure", () => {
  it("proceeds when some proposers fail but minimum is still met", async () => {
    const deps = makeDeps({
      performSummarize: async (_req, model) => {
        if (model?.model_name === "claude-3-5-haiku") {
          throw new Error("boom")
        }
        return {
          summary: `Bản tóm tắt từ ${model?.model_name}.`,
          category: "Khác",
          readingTime: 1,
          model: model?.model_name,
          usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
        }
      },
    })
    const result = await runMoAFusion(ARTICLE, undefined, makeConfig(), deps)
    assert.equal(result.pipeline.successful_proposers, 2)
    assert.deepEqual(result.pipeline.failed_proposers, ["claude-3-5-haiku"])
    const failed = result.drafts.find(d => d.model_name === "claude-3-5-haiku")!
    assert.equal(failed.status, "failed")
    assert.equal(failed.error, "boom")
  })

  it("flags timeout status when a proposer exceeds its budget", async () => {
    const deps = makeDeps({
      performSummarize: async (_req, model) => {
        if (model?.model_name === "gemini-2.0-flash-001") {
          await new Promise(resolve => setTimeout(resolve, 200))
        }
        return {
          summary: `Bản tóm tắt từ ${model?.model_name}.`,
          category: "Khác",
          readingTime: 1,
          model: model?.model_name,
          usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
        }
      },
    })
    const result = await runMoAFusion(
      ARTICLE,
      undefined,
      makeConfig({ proposerTimeoutMs: 30 }),
      deps,
    )
    const slow = result.drafts.find(d => d.model_name === "gemini-2.0-flash-001")!
    assert.equal(slow.status, "timeout")
    assert.ok(result.pipeline.failed_proposers.includes("gemini-2.0-flash-001"))
  })
})

describe("runMoAFusion — total failure", () => {
  it("throws MoAInsufficientDraftsError when fewer than minimum drafts succeed", async () => {
    const deps = makeDeps({
      performSummarize: async () => {
        throw new Error("network")
      },
    })
    await assert.rejects(
      () => runMoAFusion(ARTICLE, undefined, makeConfig(), deps),
      (err: unknown) => {
        assert.ok(err instanceof MoAInsufficientDraftsError)
        assert.equal(err.requiredCount, 2)
        assert.equal(err.successfulCount, 0)
        assert.equal(err.failedModels.length, 3)
        return true
      },
    )
  })
})

describe("runMoAFusion — aggregator failure", () => {
  it("propagates errors thrown by the aggregator", async () => {
    const deps = makeDeps({
      generateJsonCompletion: async () => {
        throw new Error("aggregator exploded")
      },
    })
    await assert.rejects(
      () => runMoAFusion(ARTICLE, undefined, makeConfig(), deps),
      /aggregator exploded/,
    )
  })
})
