import { describe, it } from "node:test"
import assert from "node:assert/strict"

import {
  mean,
  stdev,
  signTestPValue,
  pairedMetricStats,
  fleissKappa,
  fleissKappaFromRankings,
  aggregateRankings,
} from "../scripts/stats"

function approx(actual: number, expected: number, eps = 1e-3): void {
  assert.ok(
    Math.abs(actual - expected) < eps,
    `expected ${actual} ≈ ${expected} (eps ${eps})`,
  )
}

describe("mean / stdev", () => {
  it("computes mean of a small sample", () => {
    approx(mean([1, 2, 3, 4]), 2.5)
  })

  it("returns 0 for an empty sample", () => {
    approx(mean([]), 0)
  })

  it("computes sample stdev (n−1 denominator)", () => {
    // [1,2,3] has mean 2, squared-deviation sum 2, sample variance 2/2 = 1.
    approx(stdev([1, 2, 3]), 1)
  })

  it("returns 0 for a single-element sample", () => {
    approx(stdev([42]), 0)
  })
})

describe("signTestPValue (two-sided binomial, H0: p=0.5)", () => {
  it("35/50 ≈ 0.0066 (significant)", () => {
    approx(signTestPValue(35, 50), 0.0066, 5e-4)
  })

  it("26/50 ≈ 0.8877 (noise)", () => {
    approx(signTestPValue(26, 50), 0.8877, 5e-4)
  })

  it("50/50 ≈ 1.78e-15 (ultra-significant)", () => {
    approx(signTestPValue(50, 50), 1.7763568394e-15, 1e-17)
  })

  it("returns 1.0 at the exact centre (25/50)", () => {
    approx(signTestPValue(25, 50), 1)
  })

  it("returns 1.0 when total is zero (no data)", () => {
    approx(signTestPValue(0, 0), 1)
  })

  it("is symmetric: signTestPValue(w, n) == signTestPValue(n−w, n)", () => {
    approx(signTestPValue(7, 20), signTestPValue(13, 20), 1e-9)
  })
})

describe("pairedMetricStats", () => {
  it("3-pair toy input — clean sweep wins=3, p≈0.25", () => {
    const out = pairedMetricStats([0.7, 0.6, 0.8], [0.6, 0.5, 0.7])
    assert.equal(out.n, 3)
    assert.equal(out.wins, 3)
    assert.equal(out.losses, 0)
    assert.equal(out.ties, 0)
    approx(out.delta_mean, 0.1, 1e-9)
    approx(out.sign_test_p, 0.25, 1e-9)
  })

  it("drops pairs where either side is null/undefined/NaN", () => {
    const out = pairedMetricStats(
      [0.5, null, 0.7, NaN, 0.9],
      [0.4, 0.5, undefined, 0.6, 0.8],
    )
    // Only indices 0 and 4 survive.
    assert.equal(out.n, 2)
    assert.equal(out.wins, 2)
    assert.equal(out.losses, 0)
  })

  it("counts ties separately and excludes them from the sign test", () => {
    const out = pairedMetricStats([0.5, 0.5, 0.7], [0.5, 0.4, 0.6])
    assert.equal(out.wins, 2)
    assert.equal(out.losses, 0)
    assert.equal(out.ties, 1)
    // Sign-test sees wins=2, total=2 → p = 2 * 0.5^2 = 0.5
    approx(out.sign_test_p, 0.5, 1e-9)
  })

  it("returns a zeroed result when no pair survives", () => {
    const out = pairedMetricStats([null, NaN], [undefined, null])
    assert.equal(out.n, 0)
    assert.equal(out.sign_test_p, 1)
  })
})

describe("fleissKappa (raw matrix form)", () => {
  it("perfect agreement (everyone picks the same category) → κ = 1", () => {
    // 3 items, 2 categories, 4 raters. Each row puts all raters in one column.
    const matrix = [
      [4, 0],
      [0, 4],
      [4, 0],
    ]
    approx(fleissKappa(matrix), 1, 1e-9)
  })

  it("Wikipedia worked example (4 categories, 14 items, 10 raters) → κ ≈ 0.21", () => {
    // Source: https://en.wikipedia.org/wiki/Fleiss%27_kappa worked example.
    const matrix = [
      [0, 0, 0, 0, 14],
      [0, 2, 6, 4, 2],
      [0, 0, 3, 5, 6],
      [0, 3, 9, 2, 0],
      [2, 2, 8, 1, 1],
      [7, 7, 0, 0, 0],
      [3, 2, 6, 3, 0],
      [2, 5, 3, 2, 2],
      [6, 5, 2, 1, 0],
      [0, 2, 2, 3, 7],
    ]
    // Wikipedia reports κ ≈ 0.21 (slight-to-fair agreement).
    const k = fleissKappa(matrix)
    approx(k, 0.21, 0.02)
  })

  it("returns NaN for fewer than 2 raters per row", () => {
    assert.ok(Number.isNaN(fleissKappa([[1, 0], [0, 1]])))
  })

  it("returns NaN when row sums are inconsistent", () => {
    // Row 0 has 3 raters; row 1 has 2 raters → mismatch.
    assert.ok(Number.isNaN(fleissKappa([[2, 1], [2, 0]])))
  })

  it("returns NaN when every rater picks the same category (degenerate)", () => {
    // P̄_e = 1 → division by zero.
    assert.ok(Number.isNaN(fleissKappa([[3, 0], [3, 0]])))
  })
})

describe("fleissKappaFromRankings", () => {
  it("identical rankings from 3 raters → κ = 1", () => {
    const k = fleissKappaFromRankings([
      ["A", "B", "C"],
      ["A", "B", "C"],
      ["A", "B", "C"],
    ])
    approx(k, 1, 1e-9)
  })

  it("returns NaN with only one rater", () => {
    assert.ok(Number.isNaN(fleissKappaFromRankings([["A", "B", "C"]])))
  })

  it("returns NaN when rankings disagree on the label set", () => {
    const k = fleissKappaFromRankings([
      ["A", "B", "C"],
      ["A", "B", "D"],
    ])
    assert.ok(Number.isNaN(k))
  })

  it("real-world fixture: partial agreement falls between 0 and 1", () => {
    // 3 raters, K=3. Two rank A>B>C, one ranks B>A>C.
    const k = fleissKappaFromRankings([
      ["A", "B", "C"],
      ["A", "B", "C"],
      ["B", "A", "C"],
    ])
    assert.ok(k > 0 && k < 1, `expected 0 < κ < 1, got ${k}`)
  })
})

describe("aggregateRankings", () => {
  it("3-rater unanimous A>B>C — A wins every pair, avg ranks 1/2/3", () => {
    const agg = aggregateRankings([
      ["A", "B", "C"],
      ["A", "B", "C"],
      ["A", "B", "C"],
    ])
    const byLabel = Object.fromEntries(agg.map((r) => [r.label, r]))
    approx(byLabel.A.avg_rank, 1, 1e-9)
    approx(byLabel.B.avg_rank, 2, 1e-9)
    approx(byLabel.C.avg_rank, 3, 1e-9)
    approx(byLabel.A.win_rate, 1, 1e-9)
    approx(byLabel.B.win_rate, 0.5, 1e-9)
    approx(byLabel.C.win_rate, 0, 1e-9)
  })

  it("merges hidden_model lookup into the output rows", () => {
    const agg = aggregateRankings(
      [["A", "B"]],
      { A: { hidden_model: "gpt-4o", hidden_mode: "fusion" } },
    )
    const a = agg.find((r) => r.label === "A")!
    assert.equal(a.hidden_model, "gpt-4o")
    assert.equal(a.hidden_mode, "fusion")
  })
})
