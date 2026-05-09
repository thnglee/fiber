# Thesis Prep — Việc Cần Làm Trước Khi Viết T-1 / T-2

> **Status (2026-05-09):** P0-6 + P0-8 đều DONE. Thesis-decisive number landed: fused vs gpt-4o-alone → **77.1%, p=0.0002, n=48**. Capability-gap confound dissolved. Chỉ còn M-H (human study) trước khi viết T-1/T-2.

---

## Task P0-6: 50-article synthesis batch (single-domain, dataset-driven) — ✅ DONE 2026-05-09

**Result headline:** fused beats every individual proposer with sign-test significance (98% / 84% / 70% vs gpt-4o-mini / claude-haiku-4-5 / gemini-2.5-flash). Length-bucketed rates ~identical. See `fusion_reports/results/unified-report-2026-05-09T11-21-44-072Z.md` for the post-P0-8 unified report.

---

## Task P0-8: Fused vs gpt-4o-alone (THESIS-DECISIVE) — ✅ DONE 2026-05-09

**Goal:** isolate synthesis behavior from aggregator-model capability. Both candidates are gpt-4o output → "fused wins" cannot be explained by capability gap.

**Result:**
- Pairwise judge: **fused 37 / single 11 / 0 ties → 77.1%, sign-test p = 0.0002** (n=48 paired articles)
- Rubric (B.1): fused overall 4.96 vs gpt-4o-alone 4.88; biggest gap on Coverage (+0.16)
- Axis A overlap: fused beats gpt-4o-alone on every metric (BERT 0.663 vs 0.625, ROUGE-1 0.421 vs 0.362, BLEU 0.131 vs 0.069)
- B.3 factuality: gpt-4o-alone has lowest entailment (89.9%) of all candidates — confirms it's more "creative" / less faithful when alone

All three axes triangulate. **Hypothesis "fusion makes summarization better" supported.**

Cost: $0.50 (single-baseline batch) + $0.017 (judge) = ~$0.52 incremental.

**Critical files (reproducible):**
- `backend/output-fusion/scripts/run-single-baseline.ts` — POST `/api/summarize` with `routing_mode='forced', model='gpt-4o'` for each URL
- `backend/output-fusion/scripts/compare-fused-vs-single.ts` — pairs `mode='fusion'` vs `mode='sync' AND model='gpt-4o-2024-08-06'` rows by `url`, runs `judgePairwise`, persists with `comparison_type='vs_single_aggregator'`
- Migration `025_add_single_aggregator_comparison.sql` — extends CHECK constraint
- B.2c section in `unified-report.ts` — renders the headline number

---

## Task P0-6 (original spec — for reference)

### Vấn đề
Smoke n=10 (2026-05-08) verify pipeline hoạt động và direction là fused-better, nhưng chỉ 1 cell hit p<0.05 (vs gpt-4o-mini drafts, p=0.0039). Để có evidence cấp thesis, paper's effect size cần ~50 articles. Cost: ≈$0.71 (smoke synthesis-only đã chi ~$0.142 cho 10 bài).

### Decision: drop synthesis_vs_ranker
Trong setup hiện tại (proposers cheap-tier mini/flash/haiku, aggregator gpt-4o, ranker gpt-4o-mini), `synthesis_vs_ranker` bị confounded bởi capability gap giữa aggregator và proposers — giống y hệt `vs_best_draft`. Wang et al. 2024 dùng cùng model làm aggregator và ranker (Qwen1.5-110B-Chat) để isolate prompt change; setup của chúng ta không thoả điều kiện đó. Giữ lại sẽ tốn ~$0.26 mà không add methodological value beyond `vs_best_draft` + `vs_individual_draft`. Drop. Document trong methodology chapter.

### Single-domain rationale
Dùng tienphong.vn dataset có sẵn ở `metrics_reports/dataset/` (5 topics × 50 URLs). Stable result hơn multi-domain; URL đã được curate trước; thesis methodology sẽ document single-domain + topic-balanced design (10 URLs/topic × 5 topics = 50).

### Steps

1. Verify Supabase + OpenAI quota (smoke chi ~$0.20 hôm nay; batch này ≈ $0.71).

2. Input file đã sẵn: `backend/output-fusion/scripts/sample-urls-dataset-50.json` (50 URLs từ 5 topic CSVs, 10/topic).

3. Chạy synthesis batch (kèm `--judge-vs-all`):
   ```bash
   cd backend
   npx tsx output-fusion/scripts/collect-metrics.ts \
     --input output-fusion/scripts/sample-urls-dataset-50.json \
     --judge-mode both --judge-style rubric --judge-model gpt-4o-mini \
     --judge-vs-all
   ```
   Ghi lại timestamp khi bắt đầu; emit ~50 verdict `vs_best_draft` + ~150 verdict `vs_individual_draft`.

4. Generate unified report:
   ```bash
   npm run report:unified -- --since <step 3 timestamp>
   ```
   B.2c "Synthesis vs Ranker" section sẽ render "(comparison not run)" — fine, methodology chapter giải thích lý do drop.

### Acceptance criteria
- [ ] `llm_judge_pairwise` có ≥ 200 row mới sau step-3 timestamp (50 `vs_best_draft` + ~150 `vs_individual_draft`).
- [ ] Sign-test p-value reportable cho `vs_best_draft` và mỗi proposer trong `vs_individual_draft`.
- [ ] Tổng OpenAI cost ≤ $5 (expected ≈$0.71).

### Effort: ~25 phút chạy batch + 10 phút verify report ≈ **45 phút**.

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
  (H) human ranking + Fleiss κ    (~40 row rater, 20 task)

Đọc kết quả:

├── (A) fused-win-rate > 55%, p < 0.05
│   → Strong evidence: MoA WORKS trên Vietnamese news.
│   → Nếu (B) cũng decisive (fused beats EACH proposer individually) →
│     synthesis adds value across the board, không chỉ trên proposer yếu nhất.
│   → Defense story rõ ràng. Viết T-1 + T-2.
│
├── (A) 50–55%, p > 0.05
│   → Weak evidence. Triangulate:
│   │   ├── (B) per-proposer breakdown — fused beats average proposer?
│   │   │   "MoA giúp draft yếu nhưng không vượt được draft mạnh" là kết quả real.
│   │   └── Length-bucketed (raw vs bucketed) — length bias ăn signal?
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

Cross-axis reading: nếu (H) human verdict và (A/B) judge verdict diverge — đó là finding novel nhất thesis có thể claim: khi LLM-judge và human preference không đồng ý, ai đúng?

---

## Critical files

| File | Vai trò |
|------|---------|
| `backend/output-fusion/scripts/unified-report.ts` | Three-axis report generator (B.2 + B.2b render từ đây; B.2c sẽ là "comparison not run") |
| `backend/output-fusion/scripts/collect-metrics.ts` | Batch harness với `--judge-vs-all` |
| `backend/output-fusion/scripts/stats.ts` | Sign-test, Fleiss κ, length-bucketed win rate |
| `backend/output-fusion/scripts/sample-urls-dataset-50.json` | 50 URLs từ `metrics_reports/dataset/` (10/topic × 5 topics) |
| `backend/app/evaluate/admin/page.tsx` | Build human-eval task + xem κ |
| `backend/app/evaluate/page.tsx` | Rater UI |
| `fusion_reports/results/` | Tất cả output P0-6 land vào đây |
| `fusion.pdf` | Wang et al. 2024 — spec duy nhất |

Note: `compare-synthesis-vs-ranker.ts` và `--routing-mode fusion_ranker_only` vẫn còn trong code base — chỉ không dùng cho P0-6 này. Thesis methodology chapter document lý do drop.

---

## Notes

- **Cost ceiling:** smoke n=10 synthesis-only chi ~$0.142 → batch n=50 ≈ $0.71. Well dưới $5 ceiling.
- **Branch:** tất cả trên `main`. Đừng động `fix/moa-aggregator-source-prompt` — branch đó preserve historical falsification evidence với aggregator prompt CŨ; số ở đó không represent main hiện tại.
- **Memory updates sau P0-6:** ghi headline numbers (raw + bucketed win rate, sign-test p) vào `MEMORY.md` để session sau open với current state cached sẵn.
