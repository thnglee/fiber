# MoA Metrics Collection Report

- **Started:** 2026-05-08T04:50:29.616Z
- **Finished:** 2026-05-08T04:54:17.600Z
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
| 10/10 | 0.6703 | 0.3301 | 0.2587 | 0.0610 | 22797 | 0.015259 |

## Per-article comparison (fused vs best forced)

| # | Host | Best forced model | Best forced BERT | Fused BERT | Δ |
|---|---|---|---|---|---|
| 1 | tienphong.vn | — | — | 0.6424 | — |
| 2 | tienphong.vn | — | — | 0.7394 | — |
| 3 | tienphong.vn | — | — | 0.6058 | — |
| 4 | tienphong.vn | — | — | 0.6488 | — |
| 5 | tienphong.vn | — | — | 0.5863 | — |
| 6 | tienphong.vn | — | — | 0.7476 | — |
| 7 | tienphong.vn | — | — | 0.7009 | — |
| 8 | tienphong.vn | — | — | 0.6857 | — |
| 9 | tienphong.vn | — | — | 0.6760 | — |
| 10 | tienphong.vn | — | — | — | — |

## Statistical Significance (fused vs best single draft)

| Metric  | n  | Δ mean   | Δ stdev | Wins / Losses (Ties) | Sign-test p | Verdict        |
|---------|----|----------|---------|----------------------|-------------|----------------|
| BERT    | 9  | +0.0085 | 0.0281 | 6 / 3                | 0.5078      | inconclusive   |
| ROUGE-1 | 10 | +0.0065 | 0.0530 | 4 / 6                | 0.7539      | inconclusive   |
| ROUGE-2 | 10 | -0.0011 | 0.0370 | 4 / 6                | 0.7539      | inconclusive   |
| ROUGE-L | 10 | -0.0046 | 0.0373 | 5 / 5                | 1.0000      | inconclusive   |
| BLEU    | 10 | -0.0038 | 0.0366 | 5 / 5                | 1.0000      | inconclusive   |
| Judge   | 10 | —        | —       | 5 / 4 (1)            | 1.0000      | inconclusive   |

`*` significant at p < 0.05.

## LLM-Judge Pairwise (Fused vs Best-Draft)

- **Judge model:** gpt-4o-mini-2024-07-18
- **Verdicts collected:** 10/10

**Overall:** fused wins 5 · best-draft wins 4 · ties 1 · sign-test p = 1.0000 (inconclusive).

### Per-dimension win rates

| Dimension     | Fused | Best-draft | Tie | n  |
|---------------|-------|------------|-----|----|
| faithfulness  | 6     | 3          | 1   | 10 |
| coverage      | 5     | 4          | 1   | 10 |
| fluency       | 5     | 4          | 1   | 10 |
| conciseness   | 1     | 7          | 2   | 10 |

