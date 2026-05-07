# MoA Fusion — Plan Bám Sát Paper

> **Mục tiêu cuối:** Loại bỏ các khác biệt then chốt giữa hệ thống MoA hiện tại và paper Wang et al. (2024, arXiv:2406.04692), để thesis có thể tuyên bố "fusion làm tốt / không tốt" trên cùng phương pháp đo của paper.
>
> **Status (2026-05-07):** Code phase XONG. Còn lại: 1 execution task (P0-6) + thesis writing (T-1, T-2).

---

## Đã xong (code-complete trên `fusion-refactor`)

| Task | What shipped | File |
|------|--------------|------|
| P0-1 | Bỏ cap 150 từ trên aggregator | `moa.prompt.ts` |
| P0-2 | Axis B làm primary, Axis A có caveat box, sign-test p-value | `scripts/unified-report.ts` |
| P0-3 | `runFusionVsAllDraftsJudge` + cột `comparison_type` + flag `--judge-vs-all` | `moa.evaluation.ts`, migration 023 |
| P0-4 | `lengthBucketedWinRate` (simplified Dubois bucket method, MIN_BUCKET_N=5) | `scripts/stats.ts` |
| P0-5 | `runLLMRankerBaseline` + cột `pipeline_mode` + `routing_mode='fusion_ranker_only'` | `moa.service.ts`, migration 024, `app/api/summarize/route.ts` |
| P1-1 | Wang Table 1 alignment test + cite-paper comment block | `moa.prompt.ts`, `__tests__/moa.prompt.alignment.test.ts` |

Cut tasks (per v2 validation): P2-1 (multi-layer MoA), P2-2 (aggregator diversity), P1-1 v1 (2-step output), D10 (aggregator sweep) — accepted as MoA-Lite final architecture.

---

# Còn lại

## Task P0-6: Chạy đủ 100+ pairwise verdicts (volume + paired ranker baseline)

### Vấn đề
Hiện ~29 verdicts (chỉ `vs_best_draft`) → không đủ statistical power cho sign test (cần ~30 cho effect size lớn, 100+ cho effect size nhỏ-trung bình mà paper chứng kiến: ~6-8% win rate gap). Cũng chưa có verdicts loại `vs_individual_draft` và `synthesis_vs_ranker`.

### Đây không phải code task — là execution task
Ngoại lệ duy nhất: cần viết script `compare-synthesis-vs-ranker.ts` (step 6).

### Steps
1. Verify Supabase còn budget (check `OPENAI_API_KEY` quota).
2. Chuẩn bị URL list:
   - Hiện có `output-fusion/scripts/sample-urls-tienphong-50.json` (50 bài).
   - Tạo thêm `sample-urls-multi-source-50.json`: 50 bài từ tuoitre + thanhnien + vietnamnet (không dùng tienphong để tránh domain bias).
3. Chạy batch synthesis mode:
   ```bash
   cd backend
   npx tsx output-fusion/scripts/collect-metrics.ts \
     --input output-fusion/scripts/sample-urls-multi-source-50.json \
     --judge-mode both --judge-style rubric --judge-model gpt-4o \
     --judge-vs-all
   ```
4. Chạy batch ranker_only mode (paired same articles):
   ```bash
   npx tsx output-fusion/scripts/collect-metrics.ts \
     --input output-fusion/scripts/sample-urls-multi-source-50.json \
     --routing-mode fusion_ranker_only \
     --judge-mode metrics_only
   ```
   *Note:* `--routing-mode` flag chưa được implement trong `collect-metrics.ts` — cần wire flag này vào script trước khi chạy step 4. Nhỏ, ~10 dòng.
5. Viết script `backend/output-fusion/scripts/compare-synthesis-vs-ranker.ts`:
   - Query Supabase: lấy cặp (`moa_fusion_results` synthesis, `moa_fusion_results` ranker) cùng `article_url` trong batch window.
   - Với mỗi cặp, gọi `judgePairwise(synthesis_summary, ranker_summary, article)`.
   - Save với `comparison_type='synthesis_vs_ranker'`.
6. Sau khi xong:
   - 50 articles × 3 drafts = 150 fused-vs-individual verdicts
   - 50 fused-vs-best verdicts
   - 50 synthesis-vs-ranker verdicts
   - **Total: ~250 verdicts mới**
7. Chạy `npm run report:unified -- --since 2026-05-07` để get fresh report.

### Acceptance criteria
- [ ] `llm_judge_pairwise` table có ≥ 200 rows mới với `created_at > '2026-05-07'`.
- [ ] 3 loại verdict đầy đủ: vs_best_draft, vs_individual_draft, synthesis_vs_ranker.
- [ ] Sign test p-value reportable cho cả 3 loại (kể cả null result).
- [ ] Tổng cost OpenAI ≤ $10.

### Effort: 30 phút compile URL list + 30 phút wire `--routing-mode` flag + 1h viết compare script + 2-3h chạy batch + 30 phút verify ≈ **~5 giờ**.

---

# PHASE 2: Thesis writing (sau khi P0-6 done)

## Task T-1: Viết section "Methodology Alignment with MoA Paper"

### Mục tiêu
Trong chapter 3 hoặc chapter 4 của thesis, viết explicit section đối chiếu paper vs implementation.

1. **What we replicate exactly:**
   - Parallel diverse proposers (multi-provider)
   - Aggregate-and-Synthesize prompt (dịch từ Table 1)
   - LLM judge pairwise với position randomization
   - N-way ranker for best-draft selection
   - Length-controlled win rate methodology (simplified bucket method)
   - LLM-ranker baseline (Figure 4a equivalent)

2. **What we adapt for the news summarization domain:**
   - Source article in aggregator context (residual connection adapted — actually Eq. 1 done correctly)
   - Vietnamese language throughout
   - News domain (not instruction following)
   - 2-layer MoA-Lite (not full MoA — cost reasons)

3. **What we cannot directly compare:**
   - Paper benchmarks (AlpacaEval/MT-Bench/FLASK) are English instruction tasks
   - We benchmark on Vietnamese news (no equivalent leaderboard)
   - Paper uses fixed baseline (`gpt-4-1106-preview`), we use dynamic best-draft + ranker baseline

### File
- `thesis/chapters/chapter4.tex` — thêm section "Tương đồng và khác biệt với phương pháp paper gốc"

### Effort: 2-3 giờ writing

---

## Task T-2: Viết section "Results — Fusion Quality Assessment"

### Cấu trúc
1. **Axis A — Content Retention** (with caveat):
   - Bảng ROUGE/BLEU/BERT, fused vs avg-draft
   - Caveat box: "Paper Wang et al. 2024 không dùng các metric này; chúng tôi báo cáo để cho thấy structural penalty của reference-free overlap metrics đối với editorial synthesis."

2. **Axis B — Quality Preference (Aligned with Paper):**
   - Pairwise win rate (raw + length-bucketed) cho fused vs best-draft
   - Pairwise win rate cho fused vs each individual draft (per-proposer breakdown)
   - Sign test p-value
   - Comparison vs LLM-ranker baseline (Figure 4a equivalent — `synthesis_vs_ranker`)
   - Rubric (FLASK-derived 5-dim) per approach
   - Factuality (entailment % + hallucination count)

3. **Axis C — Human Validation:**
   - Aggregate ranking từ rater study (cần ≥2 raters trên 20 articles)
   - Fleiss κ (target ≥ 0.4)
   - Cross-axis correlation: judge vs human

4. **Conclusion:**
   - Statement: "Trên metric aligned với paper (LC win rate), fused output [X]% thắng best-draft (p=Y), hỗ trợ/không hỗ trợ tuyên bố của paper rằng MoA cải thiện chất lượng so với từng model riêng lẻ."

### File
- `thesis/chapters/chapter4.tex`

### Effort: 4-5 giờ writing (sau khi data ready)

---

# Decision tree — sau khi P0-6 done

```
P0-6 done → 3 loại verdict trên bàn:
  (A) fused vs best-draft (~50)
  (B) fused vs each individual draft (~150)
  (C) fused_synthesis vs fused_ranker_only (~50)

Đọc kết quả:

├── (A) Fused vs best-draft > 55%, p < 0.05
│   → Strong evidence: MoA WORKS trên Vietnamese news.
│   → Check (C): nếu synthesis > ranker → MoA aggregate thật, không chỉ select.
│   → Viết T-1, T-2 → defense story rõ ràng.
│
├── (A) 50-55%, p > 0.05
│   → Weak evidence. Triangulate với (B), (C):
│   │   ├── (B) win rate vs avg draft cao? → MoA giúp draft yếu, không vượt được draft mạnh.
│   │   │   → Report nuance: "MoA cải thiện trung bình nhưng không vượt best".
│   │   ├── Length-bucketed win rate cao hơn raw?
│   │   │   → Length bias ăn signal. Report cả 2.
│   │   └── (C) synthesis vs ranker > 55%?
│   │       → Even if (A) ngang, MoA aggregate VALUE thật so với pure selection.
│
└── (A) < 50%
    → MoA KHÔNG work trên domain này. Hai contribution path:
    │   ├── Methodological: "Paper claim không generalize sang summarization với reference-free overlap setup."
    │   └── Diagnostic: phân tích tại sao — proposer diversity? aggregator chọn sai? prompt issue?
    → Đây vẫn là kết quả khoa học hợp lệ.
```

---

# Files reference (đường dẫn tuyệt đối)

| File | Vai trò |
|------|---------|
| `backend/output-fusion/moa.service.ts` | Pipeline orchestration (`runMoAFusion` + `runLLMRankerBaseline`) |
| `backend/output-fusion/moa.prompt.ts` | Aggregator prompt (Wang Table 1 + 2 adaptations) |
| `backend/output-fusion/moa.config.ts` | Proposer/aggregator selection |
| `backend/output-fusion/moa.evaluation.ts` | Metrics + judge integration (`runFusionPairwiseJudge`, `runFusionVsAllDraftsJudge`) |
| `backend/output-fusion/moa.persistence.ts` | Supabase writes |
| `backend/output-fusion/moa.types.ts` | TypeScript types |
| `backend/output-fusion/scripts/collect-metrics.ts` | Batch harness |
| `backend/output-fusion/scripts/unified-report.ts` | Three-axis report |
| `backend/output-fusion/scripts/stats.ts` | Sign test, Fleiss κ, length-bucketed win rate |
| `backend/output-fusion/scripts/compare-synthesis-vs-ranker.ts` | **TODO (P0-6 step 5)** — paired synthesis-vs-ranker judge |
| `backend/services/llm-judge.service.ts` | Judge calls (rubric/absolute/pairwise/ranker) |
| `backend/services/llm-judge.runner.ts` | Judge config resolution |
| `fusion.pdf` | Source of truth — Wang et al. 2024 |

---

# Notes
- **Branch hygiene:** `fusion-refactor` chứa toàn bộ code phase. P0-6 chạy trên cùng branch — không cần branch mới. Không động `feature/llm-judge-evaluation` (đã ship vào main). Không động `fix/moa-aggregator-source-prompt` (preserve evidence).
- **Cost ceiling:** P0-6 estimated ≤$10 OpenAI. Confirm trước khi chạy.
- **Memory updates:** Sau P0-6, update `MEMORY.md` với headline numbers (raw + bucketed win rate, sign-test p cho cả 3 loại verdict).

---

# Changelog
- **v1 (2026-05-03):** Initial plan
- **v2 (2026-05-03):** Validation pass — cut P2-1, P2-2, P1-1 v1; promoted ranker baseline to P0-5; simplified P0-4
- **v3 (2026-05-07):** Pruned completed tasks (P0-1..P0-5, P1-1 all shipped on `fusion-refactor`). Only P0-6 (data collection + `compare-synthesis-vs-ranker.ts` script) and Phase 2 (T-1, T-2 thesis writing) remain.
