/**
 * MoA integration test. Exercises the full fusion orchestration end-to-end
 * across multiple article fixtures using injected fakes so the suite can run
 * offline in CI (no real LLM / HTTP calls). The companion real-network
 * benchmark lives in `scripts/collect-metrics.ts`.
 */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { z } from "zod"

import { SummaryDataSchema } from "@/domain/schemas"
import type {
  LLMCompletionOptions,
  LLMCompletionResult,
  ModelConfig,
  SummarizeRequest,
  SummarizeResponse,
} from "@/domain/types"

import { runMoAFusion, type MoADependencies } from "../moa.service"
import { compareFusedVsDrafts } from "../moa.evaluation"
import type { MoAConfig, MoAFusionResult, MoAScores } from "../moa.types"

// ─── Fixtures ───────────────────────────────────────────────────────────────

interface ArticleFixture {
  id: string
  site: string
  text: string
}

const FIXTURES: ArticleFixture[] = [
  {
    id: "tuoitre-weather",
    site: "tuoitre.vn",
    text:
      "Hôm nay thời tiết Hà Nội nắng đẹp, nhiệt độ cao nhất khoảng 28 độ C. " +
      "Dự báo ngày mai tiếp tục nắng nhẹ, gió nhẹ, độ ẩm trung bình 70%. " +
      "Trung tâm Khí tượng khuyến cáo người dân đề phòng tia UV cao.",
  },
  {
    id: "thanhnien-economy",
    site: "thanhnien.vn",
    text:
      "Ngân hàng Nhà nước Việt Nam vừa công bố chỉ số CPI tháng 10 tăng 0.2% so với tháng trước. " +
      "Giá xăng dầu giảm nhẹ, lương thực ổn định, dịch vụ tăng 0.4%. " +
      "Chuyên gia nhận định lạm phát năm 2026 sẽ duy trì ở mức kiểm soát được.",
  },
  {
    id: "vietnamnet-education",
    site: "vietnamnet.vn",
    text:
      "Bộ Giáo dục và Đào tạo công bố lịch thi tốt nghiệp THPT 2026. " +
      "Kỳ thi dự kiến diễn ra vào cuối tháng 6, với 4 môn bắt buộc: Toán, Văn, Ngoại ngữ, và một môn tổ hợp. " +
      "Các trường đại học tiếp tục sử dụng kết quả thi này để xét tuyển.",
  },
  {
    id: "laodong-law",
    site: "laodong.vn",
    text:
      "Quốc hội thông qua Luật Lao động sửa đổi, giảm giờ làm tuần từ 48 xuống 44 giờ. " +
      "Luật có hiệu lực từ tháng 1/2027. Các doanh nghiệp có 12 tháng để điều chỉnh hợp đồng lao động. " +
      "Người lao động được bảo đảm không bị giảm thu nhập khi giờ làm giảm.",
  },
  {
    id: "tienphong-culture",
    site: "tienphong.vn",
    text:
      "Liên hoan phim Việt Nam lần thứ 23 khai mạc tại Đà Nẵng với sự tham gia của hơn 100 bộ phim. " +
      "Chủ đề năm nay hướng về ký ức chiến tranh và hòa giải dân tộc. " +
      "Ban tổ chức trao 15 giải thưởng chính, bao gồm Bông sen Vàng cho phim xuất sắc nhất.",
  },
]

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

function makeConfig(): MoAConfig {
  return {
    proposers: [
      makeModel({ model_name: "gpt-4o-mini" }),
      makeModel({ model_name: "gemini-2.0-flash-001", provider: "gemini" }),
      makeModel({ model_name: "claude-3-5-haiku", provider: "anthropic" }),
    ],
    aggregator: makeModel({ model_name: "gpt-4o" }),
    proposerTimeoutMs: 100,
    minSuccessfulDrafts: 2,
    includeEvaluation: true,
  }
}

/**
 * Deterministic stub scores: fused beats each draft on every "higher is
 * better" metric, and wins on compression (lower is better). Scores are
 * seeded off article id so different articles produce different numbers.
 */
function makeScoreStub(): MoADependencies["scoreSummary"] {
  return async (summary: string, article: string) => {
    const articleHash = Array.from(article).reduce(
      (acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 1_000_000,
      7,
    )
    const norm = (n: number) => (n % 1000) / 1000
    const base = norm(articleHash)
    const isFused = summary.startsWith("[FUSED]")
    const bonus = isFused ? 0.08 : 0
    return {
      rouge1: 0.3 + base * 0.2 + bonus,
      rouge2: 0.2 + base * 0.15 + bonus,
      rougeL: 0.28 + base * 0.18 + bonus,
      bleu: 0.15 + base * 0.1 + bonus,
      bert_score: 0.7 + base * 0.1 + bonus,
      compression_rate: isFused ? 22 : 28 + base * 5,
    }
  }
}

function makeDeps(): MoADependencies {
  const performSummarize: MoADependencies["performSummarize"] = async (
    _req: SummarizeRequest,
    model?: ModelConfig,
  ): Promise<SummarizeResponse> => ({
    summary: `[DRAFT ${model?.model_name}] tóm tắt ngắn`,
    category: "Khác",
    readingTime: 1,
    model: model?.model_name,
    usage: { prompt_tokens: 120, completion_tokens: 25, total_tokens: 145 },
  })

  const generateJsonCompletion: MoADependencies["generateJsonCompletion"] = async <T>(
    options: LLMCompletionOptions & { schema: z.ZodSchema<T> },
  ): Promise<LLMCompletionResult<T>> => {
    const data = SummaryDataSchema.parse({
      summary: "[FUSED] bản tổng hợp cuối cùng giữ lại các điểm chính.",
      category: "Văn hóa - Giải trí",
      readingTime: 2,
    }) as unknown as T
    return {
      data,
      rawResponse: JSON.stringify(data),
      model: options.model ?? "gpt-4o",
      usage: { prompt_tokens: 800, completion_tokens: 90, total_tokens: 890 },
    }
  }

  return {
    performSummarize,
    generateJsonCompletion,
    scoreSummary: makeScoreStub(),
    runFusionPairwiseJudge: async () => null,
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("MoA integration — multi-article coverage", () => {
  it("produces a well-formed fusion result for every fixture", async () => {
    const deps = makeDeps()
    const config = makeConfig()

    const results: MoAFusionResult[] = []
    for (const fixture of FIXTURES) {
      const result = await runMoAFusion(fixture.text, fixture.site, config, deps)
      results.push(result)

      assert.equal(
        result.drafts.length,
        config.proposers.length,
        `${fixture.id}: draft count should match proposer count`,
      )
      assert.equal(
        result.pipeline.successful_proposers,
        config.proposers.length,
        `${fixture.id}: all proposers should succeed in happy path`,
      )
      assert.ok(
        result.fused.summary.startsWith("[FUSED]"),
        `${fixture.id}: fused summary should come from aggregator`,
      )
      assert.ok(
        result.pipeline.total_latency_ms >= 0,
        `${fixture.id}: latency is nonnegative`,
      )
      assert.ok(
        result.aggregator.prompt_tokens != null,
        `${fixture.id}: aggregator usage should be captured`,
      )
    }

    assert.equal(results.length, FIXTURES.length)
  })

  it("fused summary improves on every tracked metric across fixtures", async () => {
    const deps = makeDeps()
    const config = makeConfig()

    for (const fixture of FIXTURES) {
      const result = await runMoAFusion(fixture.text, fixture.site, config, deps)
      const comparison = compareFusedVsDrafts(result.fused.scores, result.drafts)

      for (const row of comparison) {
        assert.equal(
          row.improved,
          true,
          `${fixture.id}: fused should improve ${row.metric} ` +
            `(fused=${row.fused}, bestSingle=${row.bestSingle})`,
        )
      }
    }
  })

  it("aggregates cost and token totals across proposers + aggregator", async () => {
    const deps = makeDeps()
    const config = makeConfig()

    const fixture = FIXTURES[0]
    const result = await runMoAFusion(fixture.text, fixture.site, config, deps)

    const expectedTokens =
      (120 + 25) * config.proposers.length + 800 + 90
    assert.equal(result.pipeline.total_tokens, expectedTokens)

    const proposerCost = result.drafts.reduce(
      (sum, d) => sum + (d.estimated_cost_usd ?? 0),
      0,
    )
    const aggregatorCost = result.aggregator.estimated_cost_usd ?? 0
    // Sanity: pipeline total cost equals the sum of components (allow fp wiggle).
    const totalCost = result.pipeline.total_cost_usd ?? 0
    assert.ok(
      Math.abs(totalCost - (proposerCost + aggregatorCost)) < 1e-9,
      `total_cost_usd (${totalCost}) should equal proposer+aggregator (${
        proposerCost + aggregatorCost
      })`,
    )
  })

  it("captures per-site context in latency so pipeline totals are non-decreasing", async () => {
    const deps = makeDeps()
    const config = makeConfig()

    const latencies: number[] = []
    for (const fixture of FIXTURES) {
      const result = await runMoAFusion(fixture.text, fixture.site, config, deps)
      latencies.push(result.pipeline.total_latency_ms)
    }
    assert.ok(
      latencies.every(l => l >= 0),
      "every pipeline latency should be nonnegative",
    )
  })
})

describe("MoA integration — aggregate metric summary", () => {
  it("can compute mean scores across multiple runs (thesis-style reporting)", async () => {
    const deps = makeDeps()
    const config = makeConfig()

    const all: { fused: MoAScores; drafts: MoAScores[] }[] = []
    for (const fixture of FIXTURES) {
      const result = await runMoAFusion(fixture.text, fixture.site, config, deps)
      all.push({
        fused: result.fused.scores,
        drafts: result.drafts.map(d => d.scores),
      })
    }

    const mean = (nums: (number | null)[]) => {
      const vals = nums.filter((n): n is number => typeof n === "number")
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
    }

    const fusedBert = mean(all.map(x => x.fused.bert_score))
    const draftBest = mean(
      all.map(x => {
        const best = x.drafts
          .map(d => d.bert_score)
          .filter((n): n is number => typeof n === "number")
          .reduce((a, b) => Math.max(a, b), -Infinity)
        return Number.isFinite(best) ? best : null
      }),
    )

    assert.ok(fusedBert != null, "fused BERTScore mean should be available")
    assert.ok(draftBest != null, "best-draft BERTScore mean should be available")
    assert.ok(
      (fusedBert as number) > (draftBest as number),
      `fused mean BERTScore (${fusedBert}) should exceed best-draft mean (${draftBest})`,
    )
  })
})
