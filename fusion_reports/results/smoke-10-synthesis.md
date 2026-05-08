# MoA Metrics Collection Report

- **Started:** 2026-05-08T10:30:11.158Z
- **Finished:** 2026-05-08T10:34:45.613Z
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
| 10/10 | 0.6621 | 0.4029 | 0.2950 | 0.1238 | 27444 | 0.014124 |

## Per-article comparison (fused vs best forced)

| # | Host | Best forced model | Best forced BERT | Fused BERT | Δ |
|---|---|---|---|---|---|
| 1 | tienphong.vn | — | — | 0.6142 | — |
| 2 | tienphong.vn | — | — | 0.6325 | — |
| 3 | tienphong.vn | — | — | 0.6256 | — |
| 4 | tienphong.vn | — | — | 0.7055 | — |
| 5 | tienphong.vn | — | — | 0.7523 | — |
| 6 | tienphong.vn | — | — | 0.6656 | — |
| 7 | tienphong.vn | — | — | 0.5734 | — |
| 8 | tienphong.vn | — | — | 0.6552 | — |
| 9 | tienphong.vn | — | — | 0.7021 | — |
| 10 | tienphong.vn | — | — | 0.6948 | — |

## Statistical Significance (fused vs best single draft)

| Metric  | n  | Δ mean   | Δ stdev | Wins / Losses (Ties) | Sign-test p | Verdict        |
|---------|----|----------|---------|----------------------|-------------|----------------|
| BERT    | 10 | -0.0018 | 0.0453 | 6 / 4                | 0.7539      | inconclusive   |
| ROUGE-1 | 10 | +0.0463 | 0.0530 | 7 / 2 (1)            | 0.1797      | inconclusive   |
| ROUGE-2 | 10 | +0.0362 | 0.0419 | 7 / 3                | 0.3438      | inconclusive   |
| ROUGE-L | 10 | +0.0187 | 0.0320 | 6 / 4                | 0.7539      | inconclusive   |
| BLEU    | 10 | +0.0288 | 0.0427 | 6 / 4                | 0.7539      | inconclusive   |
| Judge   | 10 | —        | —       | 8 / 1 (1)            | 0.0391      | fused better * |

`*` significant at p < 0.05.

## LLM-Judge Pairwise (Fused vs Best-Draft)

- **Judge model:** gpt-4o-mini-2024-07-18
- **Verdicts collected:** 10/10

**Overall:** fused wins 8 · best-draft wins 1 · ties 1 · sign-test p = 0.0391 (**significant** at p < 0.05).

### Per-dimension win rates

| Dimension     | Fused | Best-draft | Tie | n  |
|---------------|-------|------------|-----|----|
| faithfulness  | 7     | 1          | 2   | 10 |
| coverage      | 8     | 1          | 1   | 10 |
| fluency       | 8     | 1          | 1   | 10 |
| conciseness   | 2     | 7          | 1   | 10 |
