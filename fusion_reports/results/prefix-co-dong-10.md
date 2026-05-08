# MoA Metrics Collection Report

- **Started:** 2026-05-07T19:20:48.008Z
- **Finished:** 2026-05-07T19:25:05.575Z
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
| 2/10 | 0.6314 | 0.3253 | 0.2351 | 0.0609 | 35713 | 0.012823 |

## Per-article comparison (fused vs best forced)

| # | Host | Best forced model | Best forced BERT | Fused BERT | Δ |
|---|---|---|---|---|---|
| 1 | tienphong.vn | — | — | 0.6673 | — |
| 2 | tienphong.vn | — | — | 0.5954 | — |
| 3 | tienphong.vn | — | — | — | — |
| 4 | tienphong.vn | — | — | — | — |
| 5 | tienphong.vn | — | — | — | — |
| 6 | tienphong.vn | — | — | — | — |
| 7 | tienphong.vn | — | — | — | — |
| 8 | tienphong.vn | — | — | — | — |
| 9 | tienphong.vn | — | — | — | — |
| 10 | tienphong.vn | — | — | — | — |

## Errors

- https://tienphong.vn/bat-giu-doi-tuong-lao-xe-vao-cay-xang-khien-7-nguoi-bi-thuong-post1823347.tpo [fusion]: fetch failed
- https://tienphong.vn/cuu-bo-truong-nguyen-thi-kim-tien-duoc-cap-duoi-chia-75-ty-dong-tu-100-ty-nhan-hoi-lo-post1823567.tpo [fusion]: fetch failed
- https://tienphong.vn/doanh-nghiep-noi-ve-nut-that-co-che-khien-nguon-luc-dung-yen-tren-so-sach-post1823054.tpo [fusion]: fetch failed
- https://tienphong.vn/tiem-an-rui-ro-dut-gay-thong-tin-truy-xuat-thuy-san-post1823422.tpo [fusion]: fetch failed
- https://tienphong.vn/bo-truong-bo-gddt-nguyen-kim-son-tiep-tuc-dau-tu-phat-trien-cac-truong-su-pham-post1822465.tpo [fusion]: fetch failed
- https://tienphong.vn/ban-khoan-hieu-truong-cat-phu-cap-uu-dai-cua-giao-vien-hop-dong-post1822948.tpo [fusion]: fetch failed
- https://tienphong.vn/tai-dien-canh-nhet-tien-le-vao-mam-le-post1823064.tpo [fusion]: fetch failed
- https://tienphong.vn/nhac-si-nguyen-vinh-tien-tro-thanh-y-si-o-tuoi-52-post1823424.tpo [fusion]: fetch failed

## Statistical Significance (fused vs best single draft)

| Metric  | n  | Δ mean   | Δ stdev | Wins / Losses (Ties) | Sign-test p | Verdict        |
|---------|----|----------|---------|----------------------|-------------|----------------|
| BERT    | 2  | -0.0477 | 0.0051 | 0 / 2                | 0.5000      | inconclusive   |
| ROUGE-1 | 2  | -0.0966 | 0.0258 | 0 / 2                | 0.5000      | inconclusive   |
| ROUGE-2 | 2  | -0.0889 | 0.0334 | 0 / 2                | 0.5000      | inconclusive   |
| ROUGE-L | 2  | -0.0448 | 0.0273 | 0 / 2                | 0.5000      | inconclusive   |
| BLEU    | 2  | -0.0775 | 0.0879 | 0 / 2                | 0.5000      | inconclusive   |
| Judge   | 2  | —        | —       | 0 / 1 (1)            | 1.0000      | inconclusive   |

`*` significant at p < 0.05.

## LLM-Judge Pairwise (Fused vs Best-Draft)

- **Judge model:** gpt-4o-mini-2024-07-18
- **Verdicts collected:** 2/10

**Overall:** fused wins 0 · best-draft wins 1 · ties 1 · sign-test p = 1.0000 (inconclusive).

### Per-dimension win rates

| Dimension     | Fused | Best-draft | Tie | n  |
|---------------|-------|------------|-----|----|
| faithfulness  | 0     | 1          | 1   | 2  |
| coverage      | 0     | 1          | 1   | 2  |
| fluency       | 0     | 1          | 1   | 2  |
| conciseness   | 1     | 0          | 1   | 2  |
