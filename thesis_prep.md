# Thesis Prep — Việc Cần Làm Trước Khi Viết T-1 / T-2

> **Mục tiêu:** Hai task còn lại phải xong trước khi viết các chương thesis. Code đã shipped (P0-1..P0-5, P0-7, P1-1, C-1, C-2 + commit `afac46e`). Smoke n=10 (2026-05-08) verified end-to-end success trên `main`; B.2c "Synthesis vs Ranker" section đã hiện trong unified-report. Còn: 1 execution batch, 1 human study.

Thứ tự thực hiện: **P0-6 → M-H** (M-H có thể chạy song song khi đã có rater pool).

---

## Task P0-6: Multi-source 50-article paired batch

### Vấn đề
Smoke n=10 (2026-05-08) verify pipeline hoạt động và direction là fused-better, nhưng chỉ 1 cell hit p<0.05 (vs gpt-4o-mini drafts, p=0.0039). Để có evidence cấp thesis, paper's effect size cần ~50 paired articles. Cost: ≈$1 (smoke đã chi $0.193 cho 10 bài).

URL phải multi-source (tuoitre + thanhnien + vietnamnet, **không** dùng tienphong) để tránh bị critique về domain bias.

### Steps

1. Verify Supabase + OpenAI quota (smoke chi ~$0.20 hôm nay; n=50 batch ≈ $1).

2. Compile `backend/output-fusion/scripts/sample-urls-multi-source-50.json` — 50 URL chia đều giữa tuoitre.vn, thanhnien.vn, vietnamnet.vn.

3. Chạy batch synthesis mode (kèm `--judge-vs-all`):
   ```bash
   cd backend
   npx tsx output-fusion/scripts/collect-metrics.ts \
     --input output-fusion/scripts/sample-urls-multi-source-50.json \
     --judge-mode both --judge-style rubric --judge-model gpt-4o-mini \
     --judge-vs-all
   ```
   Ghi lại timestamp khi bắt đầu; emit ~50 verdict `vs_best_draft` + ~150 verdict `vs_individual_draft`.

4. Chạy ranker_only batch trên cùng URL:
   ```bash
   npx tsx output-fusion/scripts/collect-metrics.ts \
     --input output-fusion/scripts/sample-urls-multi-source-50.json \
     --routing-mode fusion_ranker_only \
     --judge-mode metrics_only
   ```
   Tạo paired `llm_ranker` rows cùng `article_url` với step 3.

5. Chạy compare offline:
   ```bash
   npx tsx output-fusion/scripts/compare-synthesis-vs-ranker.ts \
     --since <timestamp ISO của step 3> \
     --judge-model gpt-4o-mini
   ```
   Emit ~50 verdict `synthesis_vs_ranker`.

6. Generate unified report (B.2c synthesis-vs-ranker render tự động):
   ```bash
   npm run report:unified -- --since <step 3 timestamp>
   ```

### Acceptance criteria
- [ ] `llm_judge_pairwise` có ≥ 200 row mới sau step-3 timestamp.
- [ ] Cả 3 giá trị `comparison_type` đều có trong row mới.
- [ ] Sign-test p-value reportable cho cả 3 (kể cả null result).
- [ ] Tổng OpenAI cost ≤ $10 (expected ≈$1).

### Effort: ~30 phút compile URL + 2-3h chạy batch + 30 phút verify ≈ **3 giờ**.

---

## Task M-H: 20-article human peer study (Axis C)

### Vấn đề
Three-axis evaluation cần human validation, không chỉ LLM-judge preference. Target Fleiss κ ≥ 0.4 ("moderate agreement" theo Landis-Koch). Hiện 0 response trong `human_eval_responses`.

### Steps
1. Chọn 20 bài (nguồn nào cũng được — ở đây diversity quan trọng hơn là volume verdict).
2. Với mỗi bài, dùng `/evaluate/admin` (tab Create) mint task:
   - Article URL hoặc paste text + notes
   - 3-4 candidate summaries pull từ `evaluation_metrics` qua nút "Lấy bản tóm tắt từ DB" (mix fusion-mode + sync-mode để rater so blindly)
   - Điền `hidden_model` / `hidden_mode` cho từng candidate để reveal sau khi xong study
3. Share URL `/evaluate?task=<uuid>` cho ≥ 2 rater (bản thân + ≥1 bạn cùng lớp).
4. Mỗi rater drag-rank candidates và viết 1 câu rationale per summary.
5. Sau khi response về, xem report tại `/evaluate/admin` (Review tab) — Fleiss κ + per-approach avg-rank + win-rate render tự động.
6. Re-run `npm run report:unified` — Axis C section sẽ populate.

### Acceptance criteria
- [ ] ≥ 2 rater per task trên ≥ 20 task (≥ 40 row trong `human_eval_responses`).
- [ ] Fleiss κ ≥ 0.4 trên pool (hoặc nếu thấp hơn, document diagnosis lý do disagreement).

### Effort: 1-2 giờ build task + thời gian chờ rater respond.

---

## Decision tree — sau khi P0-6 + M-H done

```
Trên bàn:
  (A) fused vs best-draft         (~50 verdict, 1 sign test)
  (B) fused vs each individual    (~150 verdict, 3 sign test theo proposer)
  (C) synthesis vs ranker         (~50 verdict, 1 sign test)
  (H) human ranking + Fleiss κ    (~40 row rater, 20 task)

Đọc kết quả:

├── (A) fused-win-rate > 55%, p < 0.05
│   → Strong evidence: MoA WORKS trên Vietnamese news.
│   → Nếu (C) > 55% nữa → MoA aggregate thật, không chỉ select.
│   → Defense story rõ ràng. Viết T-1 + T-2.
│
├── (A) 50–55%, p > 0.05
│   → Weak evidence. Triangulate:
│   │   ├── (B) per-proposer breakdown — fused beats average proposer?
│   │   │   "MoA giúp draft yếu nhưng không vượt được draft mạnh" là kết quả real.
│   │   ├── Length-bucketed (raw vs bucketed) — length bias ăn signal?
│   │   └── (C) synthesis vs ranker > 55%?
│   │       → Even khi (A) null, MoA vẫn add aggregation value vs selection.
│   → Report nuance. Walk through bảng unified-report trong T-2.
│
└── (A) < 50%
    → MoA KHÔNG work trên domain này. Hai contribution path hợp lệ:
    │   ├── Methodological: "Wang et al. 2024 không generalize sang reference-free
    │   │   Vietnamese news summarization với evaluation setup này."
    │   └── Diagnostic: phân tích tại sao — proposer diversity? aggregator pick
    │       sai? prompt issue? failure mode cụ thể từ bảng per_dimension?
    → Đây vẫn là kết quả khoa học hợp lệ.
```

Cross-axis reading: nếu (H) human verdict và (A/B/C) judge verdict diverge — đó là finding novel nhất thesis có thể claim: khi LLM-judge và human preference không đồng ý, ai đúng?

---

## Critical files

| File | Vai trò |
|------|---------|
| `backend/output-fusion/scripts/unified-report.ts` | Three-axis report generator (B.2 + B.2b + B.2c đều render từ đây) |
| `backend/output-fusion/scripts/collect-metrics.ts` | Batch harness với `--routing-mode` và `--judge-vs-all` |
| `backend/output-fusion/scripts/compare-synthesis-vs-ranker.ts` | Offline paired-pipeline judge |
| `backend/output-fusion/scripts/stats.ts` | Sign-test, Fleiss κ, length-bucketed win rate |
| `backend/app/evaluate/admin/page.tsx` | Build human-eval task + xem κ |
| `backend/app/evaluate/page.tsx` | Rater UI |
| `fusion_reports/results/` | Tất cả output P0-6 land vào đây |
| `fusion.pdf` | Wang et al. 2024 — spec duy nhất |

---

## Notes

- **Cost ceiling:** smoke n=10 chi $0.193 → P0-6 n=50 ≈ $1. Well dưới $10 ceiling.
- **Branch:** tất cả trên `main`. Đừng động `fix/moa-aggregator-source-prompt` — branch đó preserve historical falsification evidence với aggregator prompt CŨ; số ở đó không represent main hiện tại.
- **Memory updates sau P0-6:** ghi headline numbers (raw + bucketed win rate, sign-test p) vào `MEMORY.md` để session sau open với current state cached sẵn.
