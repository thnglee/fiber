# MoA Metrics Collection Report

- **Started:** 2026-05-07T19:26:25.980Z
- **Finished:** 2026-05-07T19:29:28.348Z
- **API:** http://localhost:3000
- **Articles:** 8
- **Proposers:** gpt-4o-mini, gemini-2.5-flash, claude-haiku-4-5
- **Aggregator:** gpt-4o

## Forced-mode averages (per model)

| Model | Runs | Avg BERTScore | Avg ROUGE-1 | Avg Latency (ms) | Avg Cost (USD) |
|---|---|---|---|---|---|

## Fusion-mode averages

| Runs | Avg BERTScore | Avg ROUGE-1 | Avg ROUGE-L | Avg BLEU | Avg Latency (ms) | Avg Cost (USD) |
|---|---|---|---|---|---|---|
| 8/8 | 0.6434 | 0.2871 | 0.2292 | 0.0578 | 22795 | 0.013104 |

## Per-article comparison (fused vs best forced)

| # | Host | Best forced model | Best forced BERT | Fused BERT | Δ |
|---|---|---|---|---|---|
| 1 | tienphong.vn | — | — | 0.6858 | — |
| 2 | tienphong.vn | — | — | 0.6999 | — |
| 3 | tienphong.vn | — | — | 0.5738 | — |
| 4 | tienphong.vn | — | — | 0.6290 | — |
| 5 | tienphong.vn | — | — | 0.6533 | — |
| 6 | tienphong.vn | — | — | 0.6581 | — |
| 7 | tienphong.vn | — | — | 0.6119 | — |
| 8 | tienphong.vn | — | — | 0.6357 | — |

## Statistical Significance (fused vs best single draft)

| Metric  | n  | Δ mean   | Δ stdev | Wins / Losses (Ties) | Sign-test p | Verdict        |
|---------|----|----------|---------|----------------------|-------------|----------------|
| BERT    | 8  | -0.0248 | 0.0245 | 2 / 6                | 0.2891      | inconclusive   |
| ROUGE-1 | 8  | -0.0823 | 0.0303 | 0 / 8                | 0.0078      | fused worse *  |
| ROUGE-2 | 8  | -0.0732 | 0.0312 | 0 / 8                | 0.0078      | fused worse *  |
| ROUGE-L | 8  | -0.0663 | 0.0334 | 0 / 8                | 0.0078      | fused worse *  |
| BLEU    | 8  | -0.0367 | 0.0175 | 0 / 8                | 0.0078      | fused worse *  |
| Judge   | 8  | —        | —       | 2 / 6 (0)            | 0.2891      | inconclusive   |

`*` significant at p < 0.05.

## LLM-Judge Pairwise (Fused vs Best-Draft)

- **Judge model:** gpt-4o-mini-2024-07-18
- **Verdicts collected:** 8/8

**Overall:** fused wins 2 · best-draft wins 6 · ties 0 · sign-test p = 0.2891 (inconclusive).

### Per-dimension win rates

| Dimension     | Fused | Best-draft | Tie | n  |
|---------------|-------|------------|-----|----|
| faithfulness  | 2     | 4          | 2   | 8  |
| coverage      | 2     | 6          | 0   | 8  |
| fluency       | 2     | 6          | 0   | 8  |
| conciseness   | 5     | 3          | 0   | 8  |
