# MoA Metrics Collection Report

- **Started:** 2026-04-20T03:48:31.352Z
- **Finished:** 2026-04-20T03:52:16.112Z
- **API:** http://localhost:3000
- **Articles:** 20
- **Proposers:** gpt-4o-mini, gpt-4.1-mini, o4-mini
- **Aggregator:** gpt-4o

## Forced-mode averages (per model)

| Model | Runs | Avg BERTScore | Avg ROUGE-1 | Avg Latency (ms) | Avg Cost (USD) |
|---|---|---|---|---|---|

## Fusion-mode averages

| Runs | Avg BERTScore | Avg ROUGE-1 | Avg ROUGE-L | Avg BLEU | Avg Latency (ms) | Avg Cost (USD) |
|---|---|---|---|---|---|---|
| 20/20 | 0.6001 | 0.2059 | 0.1598 | 0.0122 | 11236 | 0.010400 |

## Per-article comparison (fused vs best forced)

| # | Host | Best forced model | Best forced BERT | Fused BERT | Δ |
|---|---|---|---|---|---|
| 1 | tienphong.vn | — | — | 0.5391 | — |
| 2 | tienphong.vn | — | — | 0.6346 | — |
| 3 | tienphong.vn | — | — | 0.5680 | — |
| 4 | tienphong.vn | — | — | 0.6647 | — |
| 5 | tienphong.vn | — | — | 0.6280 | — |
| 6 | tienphong.vn | — | — | 0.6378 | — |
| 7 | tienphong.vn | — | — | 0.5230 | — |
| 8 | tienphong.vn | — | — | 0.6070 | — |
| 9 | tienphong.vn | — | — | 0.6511 | — |
| 10 | tienphong.vn | — | — | 0.5955 | — |
| 11 | tienphong.vn | — | — | 0.5634 | — |
| 12 | tienphong.vn | — | — | 0.5524 | — |
| 13 | tienphong.vn | — | — | 0.6239 | — |
| 14 | tienphong.vn | — | — | 0.5947 | — |
| 15 | tienphong.vn | — | — | 0.6118 | — |
| 16 | tienphong.vn | — | — | 0.5932 | — |
| 17 | tienphong.vn | — | — | — | — |
| 18 | tienphong.vn | — | — | 0.6244 | — |
| 19 | tienphong.vn | — | — | 0.6268 | — |
| 20 | tienphong.vn | — | — | 0.5634 | — |

## Statistical Significance (fused vs best single draft)

| Metric  | n  | Δ mean   | Δ stdev | Wins / Losses (Ties) | Sign-test p | Verdict        |
|---------|----|----------|---------|----------------------|-------------|----------------|
| BERT    | 19 | -0.0500 | 0.0323 | 0 / 19               | 0.0000      | fused worse *  |
| ROUGE-1 | 20 | -0.1215 | 0.0519 | 0 / 20               | 0.0000      | fused worse *  |
| ROUGE-2 | 20 | -0.1064 | 0.0468 | 0 / 20               | 0.0000      | fused worse *  |
| ROUGE-L | 20 | -0.0854 | 0.0431 | 0 / 20               | 0.0000      | fused worse *  |
| BLEU    | 20 | -0.0516 | 0.0483 | 0 / 20               | 0.0000      | fused worse *  |

`*` significant at p < 0.05.
