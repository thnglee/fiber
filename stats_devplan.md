# DevPlan: Statistical Significance in Batch Reports

**Project:** Fiber — Vietnamese News AI (thesis)
**Branch:** `feature/llm-judge-evaluation`
**Effort:** ~3–4 hours
**Why it matters:** Every headline number in the defense tables must
survive the question *"is that real or noise?"* This devplan adds error
bars (mean ± stdev) and paired sign-test p-values to the batch report so
that question is answered on the slide, not in the Q&A.

---

## 1. Scope

Add three things to the existing batch report
(`backend/output-fusion/scripts/collect-metrics.ts`) and its JSON output:

| Output item | Applies to | Formula |
|-------------|-----------|---------|
| **Mean ± stdev** per metric | BERT, ROUGE-1/2/L, BLEU, compression, judge rubric dims | `mean(xs) ± sqrt(var(xs))` |
| **Paired sign-test p-value** | Fused vs best-draft on each overlap metric | Two-sided binomial test on `wins / (wins+losses)` assuming p=0.5 |
| **Judge pairwise test** | Fused vs best-draft on judge preference | Same binomial test on win counts, excludes ties |

No bootstrap, no Wilcoxon, no confidence intervals beyond stdev. One
sign-test is enough for an undergrad defense — anything fancier will be
asked about by the committee and we'd rather over-prepare the basics.

## 2. Output format

### 2.1 JSON — new top-level `statistics` block

```json
{
  "statistics": {
    "per_metric": {
      "bert_score": { "n": 48, "fused_mean": 0.6387, "fused_stdev": 0.045,
                       "best_mean": 0.6506, "delta_mean": -0.0119,
                       "delta_stdev": 0.038,
                       "wins": 17, "losses": 31, "ties": 0,
                       "sign_test_p": 0.048 },
      "rouge1": { ... },
      ...
    },
    "pairwise_judge": {
      "n": 48, "wins_fused": 28, "wins_best": 18, "ties": 2,
      "sign_test_p": 0.144
    }
  }
}
```

### 2.2 Markdown — new "Statistical Significance" section

One table appended to the existing report:

```
## Statistical Significance (fused vs best single draft)

| Metric    | n  | Δ mean   | Δ stdev | Wins / Losses | Sign-test p | Verdict         |
|-----------|----|----------|---------|---------------|-------------|-----------------|
| BERT      | 48 | -0.0119  | 0.0380  | 17 / 31       | 0.048       | fused worse *   |
| ROUGE-1   | 48 | +0.0029  | 0.0470  | 24 / 24       | 1.000       | inconclusive    |
| ROUGE-L   | 48 | -0.0015  | 0.0460  | 20 / 28       | 0.312       | inconclusive    |
| BLEU      | 48 | +0.0041  | 0.0250  | 27 / 21       | 0.470       | inconclusive    |
| Judge (pairwise) | 48 | — | — | 28 / 18 (2 ties) | 0.144 | inconclusive |

* significant at p < 0.05
```

## 3. Implementation

Three small changes — all on `feature/llm-judge-evaluation`.

### 3.1 New helper — `backend/output-fusion/scripts/stats.ts`

```ts
export function mean(xs: number[]): number
export function stdev(xs: number[]): number

/** Two-sided binomial test: H0 p = 0.5, returns p-value. */
export function signTestPValue(wins: number, total: number): number

/** Pair up per-article values, compute summary stats. */
export function pairedMetricStats(
  fused: number[],
  best: number[],
): {
  n: number
  fused_mean: number; fused_stdev: number
  best_mean: number; best_stdev: number
  delta_mean: number; delta_stdev: number
  wins: number; losses: number; ties: number
  sign_test_p: number
}
```

Binomial p-value is inline (no scipy dep) — ~15 lines using log-factorial
for numerical stability. No new npm packages.

### 3.2 Extend `collect-metrics.ts`

After records are collected:
1. For each overlap metric, compute `pairedMetricStats(fused[], best[])`.
2. For pairwise judge (when judge is enabled), count wins/losses/ties and
   run `signTestPValue`.
3. Emit `statistics` block to JSON.
4. Append "Statistical Significance" section to the Markdown report.

New flag: `--stats-only <json-path>` — post-process an existing batch JSON
without re-running the API calls. Critical so we don't burn API credit
re-running existing batches just to add stats.

### 3.3 Tests — `backend/output-fusion/__tests__/stats.test.ts`

Known-input assertions:

| Input | Expected |
|-------|----------|
| `signTestPValue(35, 50)` | ≈ 0.0066 (significant) |
| `signTestPValue(26, 50)` | ≈ 0.8877 (noise) |
| `signTestPValue(50, 50)` | ≈ 1.78e-15 (ultra-significant) |
| `pairedMetricStats([0.7,0.6,0.8], [0.6,0.5,0.7])` | wins=3, losses=0, p≈0.25 |

## 4. Acceptance criteria

1. `npm run moa:collect-metrics --stats-only metrics_reports/results/fusion-batch-50.json`
   produces the same JSON with a `statistics` block added, and an updated
   `.md` with the "Statistical Significance" section — **without calling
   the API**.
2. A fresh batch run emits stats automatically.
3. Unit tests (`npm run test:moa`) pass, including 4 new tests for the
   stats helper.
4. The 50-article baseline, v1, and v2 batches (already on disk) can be
   re-processed with `--stats-only` to back-fill stats for thesis tables.

## 5. Out of scope

- Bootstrap confidence intervals
- Wilcoxon signed-rank (more powerful but the committee won't know what
  it is)
- Multiple-comparison correction (Bonferroni etc.) — we only have 4–5
  metrics, not a genome-scale test
- Power analysis — n=50 is fixed
- Per-dimension rubric sign tests — report mean ± stdev only; add if
  committee asks
