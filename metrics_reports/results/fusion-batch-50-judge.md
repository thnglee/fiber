# MoA Metrics Collection Report

- **Started:** 2026-04-26T16:25:09.617Z
- **Finished:** 2026-04-26T16:33:51.096Z
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
| 29/50 | 0.5995 | 0.1957 | 0.1527 | 0.0127 | 12591 | 0.010688 |

## Per-article comparison (fused vs best forced)

| # | Host | Best forced model | Best forced BERT | Fused BERT | Δ |
|---|---|---|---|---|---|
| 1 | tienphong.vn | — | — | 0.5383 | — |
| 2 | tienphong.vn | — | — | 0.6065 | — |
| 3 | tienphong.vn | — | — | 0.6084 | — |
| 4 | tienphong.vn | — | — | 0.6485 | — |
| 5 | tienphong.vn | — | — | 0.6098 | — |
| 6 | tienphong.vn | — | — | 0.6501 | — |
| 7 | tienphong.vn | — | — | 0.5316 | — |
| 8 | tienphong.vn | — | — | 0.5604 | — |
| 9 | tienphong.vn | — | — | 0.6631 | — |
| 10 | tienphong.vn | — | — | 0.6223 | — |
| 11 | tienphong.vn | — | — | 0.5698 | — |
| 12 | tienphong.vn | — | — | 0.5505 | — |
| 13 | tienphong.vn | — | — | 0.6284 | — |
| 14 | tienphong.vn | — | — | 0.5889 | — |
| 15 | tienphong.vn | — | — | 0.6339 | — |
| 16 | tienphong.vn | — | — | 0.5960 | — |
| 17 | tienphong.vn | — | — | — | — |
| 18 | tienphong.vn | — | — | 0.6418 | — |
| 19 | tienphong.vn | — | — | 0.6158 | — |
| 20 | tienphong.vn | — | — | 0.5701 | — |
| 21 | tienphong.vn | — | — | 0.6195 | — |
| 22 | tienphong.vn | — | — | 0.6185 | — |
| 23 | tienphong.vn | — | — | 0.6430 | — |
| 24 | tienphong.vn | — | — | 0.5541 | — |
| 25 | tienphong.vn | — | — | 0.5929 | — |
| 26 | tienphong.vn | — | — | 0.6197 | — |
| 27 | tienphong.vn | — | — | 0.5889 | — |
| 28 | tienphong.vn | — | — | — | — |
| 29 | tienphong.vn | — | — | 0.5712 | — |
| 30 | tienphong.vn | — | — | — | — |
| 31 | tienphong.vn | — | — | — | — |
| 32 | tienphong.vn | — | — | — | — |
| 33 | tienphong.vn | — | — | — | — |
| 34 | tienphong.vn | — | — | — | — |
| 35 | tienphong.vn | — | — | — | — |
| 36 | tienphong.vn | — | — | — | — |
| 37 | tienphong.vn | — | — | — | — |
| 38 | tienphong.vn | — | — | — | — |
| 39 | tienphong.vn | — | — | — | — |
| 40 | tienphong.vn | — | — | — | — |
| 41 | tienphong.vn | — | — | — | — |
| 42 | tienphong.vn | — | — | — | — |
| 43 | tienphong.vn | — | — | — | — |
| 44 | tienphong.vn | — | — | 0.5439 | — |
| 45 | tienphong.vn | — | — | — | — |
| 46 | tienphong.vn | — | — | — | — |
| 47 | tienphong.vn | — | — | — | — |
| 48 | tienphong.vn | — | — | — | — |
| 49 | tienphong.vn | — | — | — | — |
| 50 | tienphong.vn | — | — | — | — |

## Errors

- https://tienphong.vn/lanh-dao-nhieu-doanh-nghiep-ung-cu-dai-bieu-quoc-hoi-post1823909.tpo [fusion]: HTTP 500: {"error":"429 You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-er
- https://tienphong.vn/gia-dau-vang-tang-dung-dung-vi-my-khong-kich-iran-post1823885.tpo [fusion]: HTTP 500: {"error":"429 You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-er
- https://tienphong.vn/thong-tin-moi-vu-2-nu-sinh-lop-8-bi-bat-ve-lam-vo-o-nghe-an-post1823985.tpo [fusion]: HTTP 500: {"error":"429 You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-er
- https://tienphong.vn/hang-tram-hoc-sinh-da-nang-tranh-tai-robotics-va-drone-post1823977.tpo [fusion]: HTTP 500: {"error":"429 You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-er
- https://tienphong.vn/pgsts-pham-manh-ha-diem-so-khong-la-thuoc-do-kha-nang-thich-nghi-cua-tre-trong-cuoc-song-post1823820.tpo [fusion]: HTTP 500: {"error":"429 You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-er
- https://tienphong.vn/2-nu-sinh-lop-8-bi-bat-ve-lam-vo-sau-tet-post1823797.tpo [fusion]: HTTP 500: {"error":"429 You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-er
- https://tienphong.vn/bao-gio-ha-noi-cong-bo-thoi-gian-thi-tuyen-lop-10-post1823793.tpo [fusion]: HTTP 500: {"error":"429 You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-er
- https://tienphong.vn/ong-hoang-minh-son-lam-quyen-bo-truong-bo-giao-duc-va-dao-tao-post1823703.tpo [fusion]: Response missing `fusion` payload
- https://tienphong.vn/hoc-sinh-se-duoc-day-khoi-nghiep-tu-tieu-hoc-post1823526.tpo [fusion]: HTTP 500: {"error":"429 You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-er
- https://tienphong.vn/dao-tao-y-khoa-khong-the-chi-trong-giang-duong-post1823547.tpo [fusion]: HTTP 500: {"error":"429 You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-er
- https://tienphong.vn/ha-noi-du-chi-300-ty-ho-tro-dao-tao-1000-tien-si-post1823517.tpo [fusion]: Response missing `fusion` payload
- https://tienphong.vn/tuong-trinh-cua-giao-vien-bi-to-bat-35-hoc-sinh-liem-dat-post1823464.tpo [fusion]: HTTP 500: {"error":"429 You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-er
- https://tienphong.vn/cac-nguoi-dep-hoa-hau-viet-nam-check-in-tai-ngoi-chua-2000-nam-tuoi-o-bac-ninh-post1824000.tpo [fusion]: HTTP 500: {"error":"429 You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-er
- https://tienphong.vn/bien-nguoi-do-ve-song-day-xem-cac-do-vat-post1823974.tpo [fusion]: HTTP 500: {"error":"429 You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-er
- https://tienphong.vn/hieu-dung-ve-cau-cung-quanh-nam-khong-bang-ram-thang-gieng-post1823919.tpo [fusion]: HTTP 500: {"error":"429 You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-er
- https://tienphong.vn/nghe-nhac-trinh-ben-dong-song-huong-post1823845.tpo [fusion]: HTTP 500: {"error":"429 You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-er
- https://tienphong.vn/nsnd-trinh-thuy-mui-ung-cu-dai-bieu-quoc-hoi-khoa-xiv-post1823930.tpo [fusion]: Response missing `fusion` payload
- https://tienphong.vn/nhan-sac-chi-hai-quan-ho-don-tim-du-khach-tai-hoi-lim-post1823900.tpo [fusion]: HTTP 500: {"error":"429 You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-er
- https://tienphong.vn/bao-han-kinh-ngac-viet-nam-post1823892.tpo [fusion]: HTTP 500: {"error":"429 You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-er
- https://tienphong.vn/hang-nghin-nguoi-do-ve-dinh-van-noi-ruoc-lua-thieng-ve-nha-luc-nua-dem-post1823877.tpo [fusion]: HTTP 500: {"error":"429 You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs: https://platform.openai.com/docs/guides/error-codes/api-er
- https://tienphong.vn/le-ruoc-co-ba-cho-duoc-trong-dem-post1823791.tpo [fusion]: Response missing `fusion` payload

## Statistical Significance (fused vs best single draft)

| Metric  | n  | Δ mean   | Δ stdev | Wins / Losses (Ties) | Sign-test p | Verdict        |
|---------|----|----------|---------|----------------------|-------------|----------------|
| BERT    | 28 | -0.0508 | 0.0229 | 0 / 28               | 0.0000      | fused worse *  |
| ROUGE-1 | 29 | -0.1205 | 0.0517 | 0 / 29               | 0.0000      | fused worse *  |
| ROUGE-2 | 29 | -0.1039 | 0.0451 | 0 / 29               | 0.0000      | fused worse *  |
| ROUGE-L | 29 | -0.0859 | 0.0471 | 0 / 29               | 0.0000      | fused worse *  |
| BLEU    | 29 | -0.0471 | 0.0384 | 0 / 29               | 0.0000      | fused worse *  |
| Judge   | 27 | —        | —       | 4 / 20 (3)           | 0.0015      | fused worse *  |

`*` significant at p < 0.05.

## LLM-Judge Pairwise (Fused vs Best-Draft)

- **Judge model:** gpt-4o-2024-08-06
- **Verdicts collected:** 27/50

**Overall:** fused wins 4 · best-draft wins 20 · ties 3 · sign-test p = 0.0015 (**significant** at p < 0.05).

### Per-dimension win rates

| Dimension     | Fused | Best-draft | Tie | n  |
|---------------|-------|------------|-----|----|
| faithfulness  | 2     | 1          | 24  | 27 |
| coverage      | 4     | 21         | 2   | 27 |
| fluency       | 2     | 4          | 21  | 27 |
| conciseness   | 20    | 5          | 2   | 27 |
