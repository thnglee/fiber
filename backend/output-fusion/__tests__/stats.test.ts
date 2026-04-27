import { describe, it } from "node:test"
import assert from "node:assert/strict"

import {
  mean,
  stdev,
  signTestPValue,
  pairedMetricStats,
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
