import { describe, it } from "node:test"
import assert from "node:assert/strict"

import type { ModelConfig } from "@/domain/types"
import {
  pickBestDraftForJudge,
  runFusionPairwiseJudge,
  type RunFusionPairwiseDeps,
} from "../moa.evaluation"
import type { MoAScoredDraft, MoAScores } from "../moa.types"

const ARTICLE = "Hôm nay thời tiết Hà Nội nắng đẹp."
const FUSED = "Hà Nội nắng đẹp hôm nay."

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

function draft(
  model_name: string,
  scores: Partial<MoAScores> = {},
  status: MoAScoredDraft["status"] = "success",
  summary = `Bản tóm tắt từ ${model_name}.`,
): MoAScoredDraft {
  return {
    model_name,
    provider: "openai",
    summary,
    category: "Khác",
    readingTime: 1,
    latency_ms: 100,
    prompt_tokens: 50,
    completion_tokens: 20,
    estimated_cost_usd: 0.0001,
    status,
    scores: { ...emptyScores(), ...scores },
  }
}

function judgeModel(): ModelConfig {
  return {
    id: "gpt-4o",
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
  }
}

// ─── pickBestDraftForJudge ─────────────────────────────────────────────────

describe("pickBestDraftForJudge", () => {
  it("returns null when every draft failed", () => {
    const drafts = [
      draft("a", {}, "failed"),
      draft("b", {}, "timeout"),
    ]
    assert.equal(pickBestDraftForJudge(drafts), null)
  })

  it("picks the highest BERTScore when present", () => {
    const drafts = [
      draft("a", { bert_score: 0.74, rougeL: 0.5 }),
      draft("b", { bert_score: 0.81, rougeL: 0.4 }),
      draft("c", { bert_score: 0.79, rougeL: 0.45 }),
    ]
    assert.equal(pickBestDraftForJudge(drafts)!.model_name, "b")
  })

  it("falls back to ROUGE-L when no draft has bert_score", () => {
    const drafts = [
      draft("a", { rougeL: 0.42 }),
      draft("b", { rougeL: 0.51 }),
      draft("c", { rougeL: 0.39 }),
    ]
    assert.equal(pickBestDraftForJudge(drafts)!.model_name, "b")
  })

  it("falls back to ROUGE-1 when only that is available", () => {
    const drafts = [
      draft("a", { rouge1: 0.32 }),
      draft("b", { rouge1: 0.41 }),
    ]
    assert.equal(pickBestDraftForJudge(drafts)!.model_name, "b")
  })

  it("returns the first successful draft when no metrics are available", () => {
    const drafts = [
      draft("first"),
      draft("second"),
    ]
    assert.equal(pickBestDraftForJudge(drafts)!.model_name, "first")
  })

  it("ignores failed drafts entirely", () => {
    const drafts = [
      draft("a", { bert_score: 0.99 }, "failed"),
      draft("b", { bert_score: 0.5 }),
    ]
    assert.equal(pickBestDraftForJudge(drafts)!.model_name, "b")
  })
})

// ─── runFusionPairwiseJudge ────────────────────────────────────────────────

const bestDraftFixture = draft("gpt-4o-mini", { bert_score: 0.81 })

function makeDeps(over: Partial<RunFusionPairwiseDeps>): RunFusionPairwiseDeps {
  return {
    resolveJudgeConfig: async () => ({
      judge_mode: "both",
      judge_model: "gpt-4o",
      judge_style: "rubric",
    }),
    getModelByName: async name => (name === "gpt-4o" ? judgeModel() : null),
    judgePairwise: async (a, b, _src, opts) => ({
      winner: "A",
      winner_label: a.label,
      per_dimension: { faithfulness: "A", coverage: "tie", fluency: "A", conciseness: "B" },
      justification: "Fused is sharper.",
      length_note: "no length issue.",
      judge_model: opts.model.model_name,
      cost_usd: 0.008,
      latency_ms: 1500,
      position_swapped: false,
    }),
    ...over,
  }
}

describe("runFusionPairwiseJudge", () => {
  it("returns null when judge_mode is metrics_only", async () => {
    const result = await runFusionPairwiseJudge(
      { fusedSummary: FUSED, bestDraft: bestDraftFixture, articleText: ARTICLE },
      makeDeps({
        resolveJudgeConfig: async () => ({
          judge_mode: "metrics_only",
          judge_model: "gpt-4o",
          judge_style: "rubric",
        }),
      }),
    )
    assert.equal(result, null)
  })

  it("returns null when the judge model is not in model_configurations", async () => {
    const result = await runFusionPairwiseJudge(
      { fusedSummary: FUSED, bestDraft: bestDraftFixture, articleText: ARTICLE },
      makeDeps({ getModelByName: async () => null }),
    )
    assert.equal(result, null)
  })

  it("happy path — verdict mapped to persistence-ready shape", async () => {
    const result = await runFusionPairwiseJudge(
      { fusedSummary: FUSED, bestDraft: bestDraftFixture, articleText: ARTICLE },
      makeDeps({}),
    )
    assert.ok(result)
    assert.equal(result!.summary_a_label, "fused")
    assert.equal(result!.summary_b_label, "best_draft:gpt-4o-mini")
    assert.equal(result!.winner, "A")
    assert.equal(result!.winner_label, "fused")
    assert.deepEqual(result!.per_dimension, {
      faithfulness: "A", coverage: "tie", fluency: "A", conciseness: "B",
    })
    assert.equal(result!.judge_model, "gpt-4o")
    assert.equal(result!.judge_cost_usd, 0.008)
    assert.equal(result!.judge_latency_ms, 1500)
    assert.equal(result!.position_swapped, false)
  })

  it("swallows judge errors and returns null", async () => {
    const result = await runFusionPairwiseJudge(
      { fusedSummary: FUSED, bestDraft: bestDraftFixture, articleText: ARTICLE },
      makeDeps({
        judgePairwise: async () => {
          throw new Error("upstream LLM failure")
        },
      }),
    )
    assert.equal(result, null)
  })
})
