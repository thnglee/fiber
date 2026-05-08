# MoA Metrics Collection Report

- **Started:** 2026-05-08T04:40:58.062Z
- **Finished:** 2026-05-08T04:44:34.084Z
- **API:** http://localhost:3000
- **Articles:** 10
- **Proposers:** gpt-4o-mini, gemini-2.5-flash, claude-haiku-4-5
- **Aggregator:** gpt-4o

## Forced-mode averages (per model)

| Model | Runs | Avg BERTScore | Avg ROUGE-1 | Avg Latency (ms) | Avg Cost (USD) |
|---|---|---|---|---|---|

## Fusion-mode averages

| Runs | Avg BERTScore | Avg ROUGE-1 | Avg ROUGE-L | Avg BLEU | Avg Latency (ms) | Avg Cost (USD) |
|---|---|---|---|---|---|---|
| 10/10 | 0.6910 | 0.4348 | 0.3220 | 0.1635 | 21601 | 0.014077 |

## Per-article comparison (fused vs best forced)

| # | Host | Best forced model | Best forced BERT | Fused BERT | Δ |
|---|---|---|---|---|---|
| 1 | tienphong.vn | — | — | 0.7406 | — |
| 2 | tienphong.vn | — | — | 0.6196 | — |
| 3 | tienphong.vn | — | — | 0.7731 | — |
| 4 | tienphong.vn | — | — | 0.7316 | — |
| 5 | tienphong.vn | — | — | 0.6496 | — |
| 6 | tienphong.vn | — | — | 0.6874 | — |
| 7 | tienphong.vn | — | — | 0.7387 | — |
| 8 | tienphong.vn | — | — | 0.6592 | — |
| 9 | tienphong.vn | — | — | 0.6700 | — |
| 10 | tienphong.vn | — | — | 0.6406 | — |

## Statistical Significance (fused vs best single draft)

| Metric  | n  | Δ mean   | Δ stdev | Wins / Losses (Ties) | Sign-test p | Verdict        |
|---------|----|----------|---------|----------------------|-------------|----------------|
| BERT    | 10 | +0.0136 | 0.0501 | 7 / 3                | 0.3438      | inconclusive   |
| ROUGE-1 | 10 | +0.0624 | 0.0557 | 9 / 1                | 0.0215      | fused better * |
| ROUGE-2 | 10 | +0.0511 | 0.0523 | 8 / 2                | 0.1094      | inconclusive   |
| ROUGE-L | 10 | +0.0243 | 0.0538 | 6 / 4                | 0.7539      | inconclusive   |
| BLEU    | 10 | +0.0547 | 0.0549 | 9 / 1                | 0.0215      | fused better * |
| Judge   | 10 | —        | —       | 7 / 3 (0)            | 0.3438      | inconclusive   |

`*` significant at p < 0.05.

## LLM-Judge Pairwise (Fused vs Best-Draft)

- **Judge model:** gpt-4o-mini-2024-07-18
- **Verdicts collected:** 10/10

**Overall:** fused wins 7 · best-draft wins 3 · ties 0 · sign-test p = 0.3438 (inconclusive).

### Per-dimension win rates

| Dimension     | Fused | Best-draft | Tie | n  |
|---------------|-------|------------|-----|----|
| faithfulness  | 6     | 3          | 1   | 10 |
| coverage      | 7     | 3          | 0   | 10 |
| fluency       | 8     | 2          | 0   | 10 |
| conciseness   | 5     | 4          | 1   | 10 |

