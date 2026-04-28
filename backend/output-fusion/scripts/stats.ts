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

// ─── Fleiss' κ for human-eval blind rankings ────────────────────────────────

/**
 * Fleiss' κ for inter-rater agreement on categorical assignments.
 *
 * Input matrix shape: `[N items][M categories]` where each cell is the count
 * of raters who assigned that category to that item. Every row must sum to
 * the same `n` (the number of raters per item).
 *
 * Returns 1.0 for perfect agreement, 0.0 for chance-level agreement, and
 * negative values for systematic disagreement. By Landis & Koch convention:
 *   < 0.0  poor   · 0.01–0.20 slight · 0.21–0.40 fair  · 0.41–0.60 moderate
 *   0.61–0.80 substantial · 0.81–1.00 almost perfect.
 *
 * The thesis methodology chapter cares about clearing 0.4 ("moderate"). For
 * blind-ranking tasks we encode the ranking as one Fleiss matrix per
 * (item × rank-position) — see `fleissKappaFromRankings` below.
 *
 * Edge cases (return NaN — caller should treat as "not computable"):
 *   - fewer than 2 raters per item
 *   - inconsistent rater counts across rows
 *   - degenerate "everyone in one category" (P̄_e = 1, divide-by-zero)
 */
export function fleissKappa(matrix: number[][]): number {
  if (matrix.length === 0) return Number.NaN
  const M = matrix[0].length
  if (M === 0) return Number.NaN

  const N = matrix.length
  const rowSum = matrix[0].reduce((a, b) => a + b, 0)
  if (rowSum < 2) return Number.NaN
  for (const row of matrix) {
    if (row.length !== M) return Number.NaN
    let s = 0
    for (const c of row) {
      if (!Number.isFinite(c) || c < 0) return Number.NaN
      s += c
    }
    if (s !== rowSum) return Number.NaN
  }

  const n = rowSum
  // P_i = ( Σ_j n_ij² − n ) / ( n (n − 1) )
  let pBarSum = 0
  for (const row of matrix) {
    let sqSum = 0
    for (const c of row) sqSum += c * c
    pBarSum += (sqSum - n) / (n * (n - 1))
  }
  const pBar = pBarSum / N

  // p_j = ( Σ_i n_ij ) / ( N n )
  let pBarESum = 0
  for (let j = 0; j < M; j++) {
    let colSum = 0
    for (let i = 0; i < N; i++) colSum += matrix[i][j]
    const pj = colSum / (N * n)
    pBarESum += pj * pj
  }
  const pBarE = pBarESum

  if (pBarE >= 1) return Number.NaN
  return (pBar - pBarE) / (1 - pBarE)
}

/**
 * Compute Fleiss' κ from a list of rater rankings, where each ranking is an
 * ordered array of labels (best → worst). All rankings must use the same
 * label set in any order. The agreement question this answers is: *do raters
 * agree on which rank each label deserves?* — encoded as a Fleiss matrix
 * with one row per label and one column per rank position.
 *
 * Returns NaN for fewer than 2 raters, mismatched label sets, duplicate
 * labels in a ranking, or empty input.
 */
export function fleissKappaFromRankings(rankings: string[][]): number {
  if (rankings.length < 2) return Number.NaN

  const first = rankings[0]
  const labels = [...first]
  if (new Set(labels).size !== labels.length) return Number.NaN

  for (const r of rankings) {
    if (r.length !== labels.length) return Number.NaN
    if (new Set(r).size !== r.length) return Number.NaN
    for (const lbl of r) if (!labels.includes(lbl)) return Number.NaN
  }

  const M = labels.length
  // matrix[i][j] = number of raters who placed label `labels[i]` at rank j.
  const matrix: number[][] = labels.map(() => new Array(M).fill(0))
  for (const r of rankings) {
    for (let pos = 0; pos < r.length; pos++) {
      const labelIdx = labels.indexOf(r[pos])
      matrix[labelIdx][pos] += 1
    }
  }

  return fleissKappa(matrix)
}

export interface RankingAggregate {
  label: string
  hidden_model?: string
  hidden_mode?: string
  avg_rank: number
  // Fraction of head-to-head pairs vs other labels where this label ranked
  // strictly higher (best=1). A label that always wins gets 1.0.
  win_rate: number
  rater_count: number
}

/**
 * Per-label averages + pairwise win rate from a list of rater rankings.
 * Rankings are best→worst; rank 1 is best. Labels not present in a rater's
 * ranking are skipped for that rater (defensive — should not happen given
 * the API validation, but keeps the helper robust).
 */
export function aggregateRankings(
  rankings: string[][],
  hiddenLookup: Record<string, { hidden_model?: string; hidden_mode?: string }> = {},
): RankingAggregate[] {
  if (rankings.length === 0) return []
  const labels = [...rankings[0]]
  if (labels.length === 0) return []

  const sums: Record<string, number> = Object.fromEntries(labels.map((l) => [l, 0]))
  const counts: Record<string, number> = Object.fromEntries(labels.map((l) => [l, 0]))
  // Pairwise wins: wins[l1][l2] = number of times l1 ranked higher than l2.
  const wins: Record<string, Record<string, number>> = {}
  for (const l of labels) {
    wins[l] = Object.fromEntries(labels.map((x) => [x, 0]))
  }

  for (const ranking of rankings) {
    for (let i = 0; i < ranking.length; i++) {
      const lbl = ranking[i]
      if (lbl in sums) {
        sums[lbl] += i + 1
        counts[lbl] += 1
      }
      for (let j = i + 1; j < ranking.length; j++) {
        const better = ranking[i]
        const worse = ranking[j]
        if (better in wins && worse in wins[better]) wins[better][worse] += 1
      }
    }
  }

  return labels.map((label) => {
    const c = counts[label] || 0
    const avg = c > 0 ? sums[label] / c : 0
    let totalWins = 0
    let totalPairs = 0
    for (const other of labels) {
      if (other === label) continue
      totalWins += wins[label][other]
      totalPairs += wins[label][other] + wins[other][label]
    }
    return {
      label,
      hidden_model: hiddenLookup[label]?.hidden_model,
      hidden_mode: hiddenLookup[label]?.hidden_mode,
      avg_rank: avg,
      win_rate: totalPairs === 0 ? 0 : totalWins / totalPairs,
      rater_count: c,
    }
  })
}
