import { describe, it } from "node:test"
import assert from "node:assert/strict"

import { buildAggregatorPrompt, type AggregatorDraft } from "../moa.prompt"

/**
 * Alignment with Wang et al. (2024) Table 1.
 *
 * Each row asserts that the Vietnamese translation of a Table 1 keyword phrase
 * is present in the aggregator prompt. If a future edit drops one of these
 * phrases, this test fails and prevents silent drift away from the paper's
 * Aggregate-and-Synthesize spec.
 */

const FIXTURE_ARTICLE = "Bài báo gốc giả lập dùng cho test alignment."
const FIXTURE_DRAFTS: AggregatorDraft[] = [
  { model_name: "model-a", summary: "Bản tóm tắt A." },
  { model_name: "model-b", summary: "Bản tóm tắt B." },
]

describe("moa.prompt — Table 1 alignment", () => {
  const prompt = buildAggregatorPrompt(FIXTURE_ARTICLE, FIXTURE_DRAFTS)

  const tableOneKeywords: Array<{ paper: string; vi: string }> = [
    { paper: "various ... models", vi: "nhiều mô hình ngôn ngữ khác nhau" },
    { paper: "synthesize into a single, high-quality response", vi: "tổng hợp" },
    { paper: "single, high-quality response", vi: "duy nhất, chất lượng cao nhất" },
    { paper: "critically evaluate", vi: "đánh giá có phản biện" },
    { paper: "biased or incorrect", vi: "thiên lệch hoặc sai lệch" },
    { paper: "should not simply replicate", vi: "KHÔNG nên chỉ sao chép nguyên văn" },
    { paper: "refined, accurate, and comprehensive", vi: "tinh chỉnh, chính xác và toàn diện" },
    { paper: "well-structured, coherent", vi: "có cấu trúc tốt, mạch lạc" },
    { paper: "highest standards of accuracy and reliability", vi: "tiêu chuẩn cao nhất về độ chính xác và độ tin cậy" },
  ]

  for (const { paper, vi } of tableOneKeywords) {
    it(`contains Vietnamese rendering of "${paper}"`, () => {
      assert.ok(
        prompt.includes(vi),
        `Aggregator prompt missing "${vi}" — Table 1 keyword "${paper}" no longer represented.\nPrompt was:\n${prompt}`,
      )
    })
  }

  it("documents both domain adaptations (Vietnamese journalism style + source residual)", () => {
    assert.ok(
      prompt.includes("phong cách báo chí Việt Nam"),
      "Adaptation 1 (Vietnamese journalism register) missing from prompt",
    )
    assert.ok(
      prompt.includes("đối chiếu") && prompt.includes("Bài viết gốc"),
      "Adaptation 2 (source article residual connection) missing from prompt",
    )
  })

  it("includes the source article verbatim for factual grounding", () => {
    assert.ok(
      prompt.includes(FIXTURE_ARTICLE),
      "Source article not injected — residual connection broken",
    )
  })

  it("includes every proposer draft labelled by model name", () => {
    for (const draft of FIXTURE_DRAFTS) {
      assert.ok(
        prompt.includes(`Mô hình ${draft.model_name}`),
        `Draft from ${draft.model_name} not labelled in prompt`,
      )
      assert.ok(prompt.includes(draft.summary), `Draft body from ${draft.model_name} missing`)
    }
  })

  it("does not reintroduce the 150-word cap (P0-1 regression guard)", () => {
    assert.ok(!prompt.includes("150"), "150-word cap leaked back into prompt")
  })
})
