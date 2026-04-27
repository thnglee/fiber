/**
 * Statistical helpers for batch report significance testing.
 *
 * Used by `collect-metrics.ts` to attach mean ± stdev and a paired
 * sign-test p-value to fused-vs-best-draft comparisons.
 *
 * No new npm packages — binomial p-value is computed inline using a
 * cached log-factorial table for numerical stability.
 *
 * See `stats_devplan.md` §3 for spec and §3.3 for the unit-test fixtures.
 */

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0
  let sum = 0
  for (const x of xs) sum += x
  return sum / xs.length
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  let sq = 0
  for (const x of xs) {
    const d = x - m
    sq += d * d
  }
  return Math.sqrt(sq / (xs.length - 1))
}

// ─── Binomial sign-test ─────────────────────────────────────────────────────

const LN_FACT_CACHE: number[] = [0]

function lnFactorial(n: number): number {
  if (!Number.isFinite(n) || n < 0) return Number.NaN
  const k = Math.floor(n)
  for (let i = LN_FACT_CACHE.length; i <= k; i++) {
    LN_FACT_CACHE[i] = LN_FACT_CACHE[i - 1] + Math.log(i)
  }
  return LN_FACT_CACHE[k]
}

function lnChoose(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity
  return lnFactorial(n) - lnFactorial(k) - lnFactorial(n - k)
}

/**
 * Two-sided binomial test against H0: p = 0.5.
 *
 * Returns the probability that, under fair coin flips, you'd observe a
 * deviation from n/2 at least as extreme as |wins − n/2|.
 *
 * Edge cases:
 *   - total ≤ 0          → 1.0
 *   - wins == n − wins   → 1.0 (exact center)
 *   - wins outside [0,n] → 1.0
 */
export function signTestPValue(wins: number, total: number): number {
  if (!Number.isFinite(wins) || !Number.isFinite(total)) return 1
  const n = Math.floor(total)
  const w = Math.floor(wins)
  if (n <= 0) return 1
  if (w < 0 || w > n) return 1

  const losses = n - w
  if (w === losses) return 1

  const k = Math.min(w, losses)
  // Sum tail probability P(X ≤ k) under Binomial(n, 0.5).
  // p = sum_{i=0..k} C(n,i) * 0.5^n; double for two-sided.
  const lnHalfN = -n * Math.LN2
  let tail = 0
  for (let i = 0; i <= k; i++) {
    tail += Math.exp(lnChoose(n, i) + lnHalfN)
  }
  return Math.min(1, 2 * tail)
}

// ─── Paired metric statistics ───────────────────────────────────────────────

export interface PairedMetricStats {
  n: number
  fused_mean: number
  fused_stdev: number
  best_mean: number
  best_stdev: number
  delta_mean: number
  delta_stdev: number
  wins: number
  losses: number
  ties: number
  sign_test_p: number
}

/**
 * Pair up per-article values and summarise them. `fused[i]` is paired
 * with `best[i]`; pairs containing a non-finite value are dropped.
 *
 * `wins` = pairs where fused > best, `losses` = pairs where fused < best,
 * `ties` = exact equality. The sign-test ignores ties (standard
 * convention) and is computed as `signTestPValue(wins, wins+losses)`.
 */
export function pairedMetricStats(
  fused: Array<number | null | undefined>,
  best: Array<number | null | undefined>,
): PairedMetricStats {
  const fusedKept: number[] = []
  const bestKept: number[] = []
  const len = Math.min(fused.length, best.length)
  for (let i = 0; i < len; i++) {
    const f = fused[i]
    const b = best[i]
    if (
      typeof f === "number" &&
      Number.isFinite(f) &&
      typeof b === "number" &&
      Number.isFinite(b)
    ) {
      fusedKept.push(f)
      bestKept.push(b)
    }
  }

  const n = fusedKept.length
  if (n === 0) {
    return {
      n: 0,
      fused_mean: 0,
      fused_stdev: 0,
      best_mean: 0,
      best_stdev: 0,
      delta_mean: 0,
      delta_stdev: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      sign_test_p: 1,
    }
  }

  const deltas = fusedKept.map((f, i) => f - bestKept[i])
  let wins = 0
  let losses = 0
  let ties = 0
  for (const d of deltas) {
    if (d > 0) wins++
    else if (d < 0) losses++
    else ties++
  }

  return {
    n,
    fused_mean: mean(fusedKept),
    fused_stdev: stdev(fusedKept),
    best_mean: mean(bestKept),
    best_stdev: stdev(bestKept),
    delta_mean: mean(deltas),
    delta_stdev: stdev(deltas),
    wins,
    losses,
    ties,
    sign_test_p: signTestPValue(wins, wins + losses),
  }
}
