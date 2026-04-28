import { describe, it } from "node:test"
import assert from "node:assert/strict"

import type { ModelConfig } from "@/domain/types"
import type { JudgeConfig } from "@/domain/schemas"
import {
  resolveJudgeConfig,
  runJudgeForSummary,
  type RunnerDeps,
} from "../llm-judge.runner"

function model(name = "gpt-4o"): ModelConfig {
  return {
    id: name,
    provider: "openai",
    model_name: name,
    display_name: name,
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

const FACTUALITY_DEFAULTS: Pick<JudgeConfig, "factuality_enabled" | "factuality_model"> = {
  factuality_enabled: false,
  factuality_model: "gpt-4o-mini",
}

function deps(over: Partial<RunnerDeps> & { stored: Omit<JudgeConfig, "factuality_enabled" | "factuality_model"> & Partial<Pick<JudgeConfig, "factuality_enabled" | "factuality_model">> }): RunnerDeps {
  const stored: JudgeConfig = { ...FACTUALITY_DEFAULTS, ...over.stored }
  return {
    getStoredConfig: async () => stored,
    getModelByName: async (name: string) => (name === "gpt-4o" ? model("gpt-4o") : null),
    judgeRubric: async (_s, _src, opts) => ({
      scores: { faithfulness: 5, coverage: 4, fluency: 5, conciseness: 4, overall: 5 },
      justification: "Good summary.",
      judge_model: opts.model.model_name,
      cost_usd: 0.0035,
      latency_ms: 42,
    }),
    judgeAbsolute: async (_s, _src, opts) => ({
      score: 8,
      justification: "Solid.",
      judge_model: opts.model.model_name,
      cost_usd: 0.0035,
      latency_ms: 33,
    }),
    ...over,
  }
}

const SUMMARY = "Hà Nội nắng đẹp."
const SOURCE = "Hôm nay thời tiết Hà Nội nắng đẹp, nhiệt độ 28 độ C."

describe("resolveJudgeConfig", () => {
  it("uses stored config when no override is provided", async () => {
    const eff = await resolveJudgeConfig(undefined, deps({
      stored: { judge_mode: "both", default_judge_model: "gpt-4o", default_judge_style: "rubric" },
    }))
    assert.equal(eff.judge_mode, "both")
    assert.equal(eff.judge_model, "gpt-4o")
    assert.equal(eff.judge_style, "rubric")
  })

  it("override fields beat stored values", async () => {
    const eff = await resolveJudgeConfig(
      { judge_mode: "judge_only", judge_style: "absolute" },
      deps({
        stored: { judge_mode: "metrics_only", default_judge_model: "gpt-4o", default_judge_style: "rubric" },
      }),
    )
    assert.equal(eff.judge_mode, "judge_only")
    assert.equal(eff.judge_style, "absolute")
    assert.equal(eff.judge_model, "gpt-4o") // not overridden
  })
})

describe("runJudgeForSummary", () => {
  it("returns null when judge_mode is metrics_only", async () => {
    const result = await runJudgeForSummary(SUMMARY, SOURCE, undefined, deps({
      stored: { judge_mode: "metrics_only", default_judge_model: "gpt-4o", default_judge_style: "rubric" },
    }))
    assert.equal(result, null)
  })

  it("runs rubric and produces persistence-ready fields", async () => {
    const result = await runJudgeForSummary(SUMMARY, SOURCE, { judge_mode: "both" }, deps({
      stored: { judge_mode: "metrics_only", default_judge_model: "gpt-4o", default_judge_style: "rubric" },
    }))
    assert.ok(result)
    assert.equal(result!.judge_mode, "both")
    assert.equal(result!.judge_style, "rubric")
    assert.equal(result!.judge_absolute, null)
    assert.deepEqual(result!.judge_rubric, {
      faithfulness: 5, coverage: 4, fluency: 5, conciseness: 4, overall: 5,
    })
    assert.equal(result!.judge_justification, "Good summary.")
    assert.equal(result!.judge_cost_usd, 0.0035)
    assert.equal(result!.judge_latency_ms, 42)
  })

  it("runs absolute when override style is absolute", async () => {
    const result = await runJudgeForSummary(SUMMARY, SOURCE, { judge_mode: "judge_only", judge_style: "absolute" }, deps({
      stored: { judge_mode: "metrics_only", default_judge_model: "gpt-4o", default_judge_style: "rubric" },
    }))
    assert.ok(result)
    assert.equal(result!.judge_style, "absolute")
    assert.equal(result!.judge_absolute, 8)
    assert.equal(result!.judge_rubric, null)
  })

  it("returns null and warns when judge model is not in DB", async () => {
    const result = await runJudgeForSummary(SUMMARY, SOURCE, { judge_mode: "both", judge_model: "missing-model" }, deps({
      stored: { judge_mode: "metrics_only", default_judge_model: "gpt-4o", default_judge_style: "rubric" },
    }))
    assert.equal(result, null)
  })

  it("swallows judge call errors and returns null", async () => {
    const result = await runJudgeForSummary(SUMMARY, SOURCE, { judge_mode: "both" }, deps({
      stored: { judge_mode: "metrics_only", default_judge_model: "gpt-4o", default_judge_style: "rubric" },
      judgeRubric: async () => {
        throw new Error("upstream failure")
      },
    }))
    assert.equal(result, null)
  })
})
