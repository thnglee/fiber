# MoA Metrics Collection Report

- **Started:** 2026-05-08T10:35:24.415Z
- **Finished:** 2026-05-08T10:37:58.095Z
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
| 10/10 | 0.6365 | 0.3274 | 0.2530 | 0.0712 | 15367 | 0.004713 |

## Per-article comparison (fused vs best forced)

| # | Host | Best forced model | Best forced BERT | Fused BERT | Δ |
|---|---|---|---|---|---|
| 1 | tienphong.vn | — | — | 0.5827 | — |
| 2 | tienphong.vn | — | — | 0.6153 | — |
| 3 | tienphong.vn | — | — | 0.6054 | — |
| 4 | tienphong.vn | — | — | 0.6944 | — |
| 5 | tienphong.vn | — | — | 0.6674 | — |
| 6 | tienphong.vn | — | — | 0.6795 | — |
| 7 | tienphong.vn | — | — | 0.5613 | — |
| 8 | tienphong.vn | — | — | 0.6525 | — |
| 9 | tienphong.vn | — | — | 0.6349 | — |
| 10 | tienphong.vn | — | — | 0.6714 | — |

## Statistical Significance (fused vs best single draft)

| Metric  | n  | Δ mean   | Δ stdev | Wins / Losses (Ties) | Sign-test p | Verdict        |
|---------|----|----------|---------|----------------------|-------------|----------------|
| BERT    | 10 | -0.0189 | 0.0210 | 0 / 6 (4)            | 0.0313      | fused worse *  |
| ROUGE-1 | 10 | -0.0217 | 0.0335 | 0 / 4 (6)            | 0.1250      | inconclusive   |
| ROUGE-2 | 10 | -0.0216 | 0.0353 | 0 / 4 (6)            | 0.1250      | inconclusive   |
| ROUGE-L | 10 | -0.0102 | 0.0222 | 0 / 4 (6)            | 0.1250      | inconclusive   |
| BLEU    | 10 | -0.0166 | 0.0284 | 0 / 4 (6)            | 0.1250      | inconclusive   |

`*` significant at p < 0.05.
