# MoA Metrics Collection Report

- **Started:** 2026-04-19T17:12:45.680Z
- **Finished:** 2026-04-19T17:22:39.002Z
- **API:** http://localhost:3000
- **Articles:** 50
- **Proposers:** gpt-4o-mini, gpt-4.1-mini, o4-mini
- **Aggregator:** gpt-4o

## Forced-mode averages (per model)

| Model | Runs | Avg BERTScore | Avg ROUGE-1 | Avg Latency (ms) | Avg Cost (USD) |
|---|---|---|---|---|---|

## Fusion-mode averages

| Runs | Avg BERTScore | Avg ROUGE-1 | Avg ROUGE-L | Avg BLEU | Avg Latency (ms) | Avg Cost (USD) |
|---|---|---|---|---|---|---|
| 49/50 | 0.6387 | 0.3433 | 0.2543 | 0.0702 | 12066 | 0.014054 |

## Per-article comparison (fused vs best forced)

| # | Host | Best forced model | Best forced BERT | Fused BERT | Δ |
|---|---|---|---|---|---|
| 1 | tienphong.vn | — | — | 0.5516 | — |
| 2 | tienphong.vn | — | — | 0.6423 | — |
| 3 | tienphong.vn | — | — | 0.6174 | — |
| 4 | tienphong.vn | — | — | 0.6530 | — |
| 5 | tienphong.vn | — | — | 0.6629 | — |
| 6 | tienphong.vn | — | — | 0.6737 | — |
| 7 | tienphong.vn | — | — | 0.5491 | — |
| 8 | tienphong.vn | — | — | 0.6465 | — |
| 9 | tienphong.vn | — | — | 0.6588 | — |
| 10 | tienphong.vn | — | — | 0.6534 | — |
| 11 | tienphong.vn | — | — | 0.5826 | — |
| 12 | tienphong.vn | — | — | — | — |
| 13 | tienphong.vn | — | — | 0.6360 | — |
| 14 | tienphong.vn | — | — | 0.5995 | — |
| 15 | tienphong.vn | — | — | 0.7046 | — |
| 16 | tienphong.vn | — | — | 0.6541 | — |
| 17 | tienphong.vn | — | — | — | — |
| 18 | tienphong.vn | — | — | 0.6661 | — |
| 19 | tienphong.vn | — | — | 0.6355 | — |
| 20 | tienphong.vn | — | — | 0.6171 | — |
| 21 | tienphong.vn | — | — | 0.6718 | — |
| 22 | tienphong.vn | — | — | 0.6654 | — |
| 23 | tienphong.vn | — | — | 0.6848 | — |
| 24 | tienphong.vn | — | — | 0.6909 | — |
| 25 | tienphong.vn | — | — | 0.6885 | — |
| 26 | tienphong.vn | — | — | 0.6631 | — |
| 27 | tienphong.vn | — | — | 0.6578 | — |
| 28 | tienphong.vn | — | — | 0.6610 | — |
| 29 | tienphong.vn | — | — | 0.5753 | — |
| 30 | tienphong.vn | — | — | 0.5971 | — |
| 31 | tienphong.vn | — | — | 0.6309 | — |
| 32 | tienphong.vn | — | — | 0.6853 | — |
| 33 | tienphong.vn | — | — | 0.5647 | — |
| 34 | tienphong.vn | — | — | 0.6973 | — |
| 35 | tienphong.vn | — | — | 0.6148 | — |
| 36 | tienphong.vn | — | — | 0.7579 | — |
| 37 | tienphong.vn | — | — | 0.6515 | — |
| 38 | tienphong.vn | — | — | 0.6241 | — |
| 39 | tienphong.vn | — | — | 0.6089 | — |
| 40 | tienphong.vn | — | — | 0.6609 | — |
| 41 | tienphong.vn | — | — | 0.6090 | — |
| 42 | tienphong.vn | — | — | 0.5981 | — |
| 43 | tienphong.vn | — | — | 0.7111 | — |
| 44 | tienphong.vn | — | — | 0.5795 | — |
| 45 | tienphong.vn | — | — | 0.6336 | — |
| 46 | tienphong.vn | — | — | 0.5958 | — |
| 47 | tienphong.vn | — | — | 0.6313 | — |
| 48 | tienphong.vn | — | — | — | — |
| 49 | tienphong.vn | — | — | 0.5908 | — |
| 50 | tienphong.vn | — | — | 0.6143 | — |

## Errors

- https://tienphong.vn/con-duong-den-an-tu-cua-ong-trum-ma-tuy-post1823872.tpo [fusion]: HTTP 404: <!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="stylesheet" href="/_next/static/css/app/layout.css?v=1776618

## Statistical Significance (fused vs best single draft)

| Metric  | n  | Δ mean   | Δ stdev | Wins / Losses (Ties) | Sign-test p | Verdict        |
|---------|----|----------|---------|----------------------|-------------|----------------|
| BERT    | 47 | -0.0116 | 0.0227 | 17 / 30              | 0.0789      | inconclusive   |
| ROUGE-1 | 49 | +0.0032 | 0.0457 | 25 / 24              | 1.0000      | inconclusive   |
| ROUGE-2 | 49 | +0.0060 | 0.0406 | 28 / 20 (1)          | 0.3123      | inconclusive   |
| ROUGE-L | 49 | -0.0012 | 0.0423 | 21 / 27 (1)          | 0.4709      | inconclusive   |
| BLEU    | 49 | +0.0041 | 0.0393 | 28 / 21              | 0.3916      | inconclusive   |

`*` significant at p < 0.05.

