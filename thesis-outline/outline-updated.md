# OUTLINE KHÓA LUẬN TỐT NGHIỆP (CẬP NHẬT)

**Đề tài:** Nghiên cứu, xây dựng hệ thống tóm tắt và kiểm chứng tin tức tiếng Việt sử dụng mô hình ngôn ngữ lớn.

**Sinh viên:** Lê Văn Thắng — 22028313  
**Cán bộ hướng dẫn:** TS. Vương Thị Hồng  
**Cập nhật:** 05/2026 (phản ánh hệ thống hoàn chỉnh)

---

## MỤC LỤC DỰ KIẾN

Trang bìa · Trang phụ bìa (VI/EN) · Tóm tắt · Abstract · Lời cam đoan · Mục lục · Danh mục hình · Danh mục bảng · Bảng ký hiệu viết tắt

---

## MỞ ĐẦU

**Tính cấp thiết**
Sự bùng nổ thông tin trực tuyến tiếng Việt đặt ra hai thách thức song song: người dùng cần tóm tắt nhanh nội dung bài báo và cần công cụ kiểm chứng độ chính xác. Các hệ thống tóm tắt đơn mô hình còn hạn chế; kỹ thuật Mixture-of-Agents (MoA) — kết hợp nhiều LLM để tổng hợp đầu ra — chưa được nghiên cứu cho tiếng Việt. Đồng thời, các metric đánh giá truyền thống (ROUGE/BLEU/BERTScore) đo độ trùng lặp với văn bản gốc, không phản ánh chính xác chất lượng tóm tắt theo tiêu chí người dùng.

**Mục tiêu nghiên cứu**

1. Xây dựng hệ thống tiện ích trình duyệt tích hợp tóm tắt + kiểm chứng tin tức tiếng Việt.
2. Triển khai pipeline MoA (Wang et al., 2024) cho tóm tắt tiếng Việt.
3. Xây dựng framework đánh giá ba trục (Axis A/B/C) để kiểm chứng thực nghiệm MoA, làm rõ giới hạn của overlap metrics.

**Đối tượng & phạm vi**
Bài báo tiếng Việt từ các trang: tuoitre.vn, thanhnien.vn, tienphong.vn, vietnamnet.vn, vtv.vn; 5 chủ đề: thời sự, pháp luật, kinh tế, giáo dục, văn hóa.

**Phương pháp nghiên cứu**
Thực nghiệm so sánh đa mô hình; đánh giá tự động (ROUGE/BLEU/BERTScore — Axis A), đánh giá bởi LLM-judge (pairwise AlpacaEval-style — Axis B), và đánh giá con người mù (blind human ranking — Axis C); kiểm định thống kê (sign test, Fleiss κ).

**Cấu trúc khóa luận:** 4 chương chính.

---

## Chương 1. Tổng quan

### 1.1. Bài toán tóm tắt văn bản tự động

Định nghĩa; phân loại extractive vs. abstractive, single vs. multi-document; tóm tắt tiếng Việt — thách thức đặc thù (từ ghép đa âm tiết, thiếu benchmark corpus).

### 1.2. Bài toán kiểm chứng tin tức

Tin giả và misinformation trong bối cảnh Việt Nam; pipeline kiểm chứng tự động: claim detection → evidence retrieval → verdict prediction; hướng search-augmented verification.

### 1.3. Mixture-of-Agents (MoA)

Tổng quan Wang et al. (2024): kiến trúc proposer–aggregator hai tầng; nguyên lý "model làm aggregator hoạt động tốt hơn khi được cung cấp nhiều draft từ các model khác"; kết quả gốc trên AlpacaEval 2.0 (win rate 65.1%); câu hỏi mở về transfer sang grounded summarization.

### 1.4. Các công trình liên quan

Hệ thống tóm tắt: Google News, BáoMới; tools fact-check: ClaimBuster, Google Fact Check Tools; browser extensions: TLDR, Newsguard. Khoảng trống: chưa có giải pháp tích hợp MoA cho tiếng Việt với framework đánh giá đa trục.

### 1.5. Tổng kết chương

---

## Chương 2. Cơ sở lý thuyết

### 2.1. Mô hình ngôn ngữ lớn

- **2.1.1.** Kiến trúc Transformer (Vaswani et al., 2017): self-attention, multi-head, encoder-decoder.
- **2.1.2.** Các dòng mô hình: encoder-only (BERT), decoder-only (GPT), encoder-decoder (T5).
- **2.1.3.** Các mô hình trong hệ thống: GPT-4o (aggregator), GPT-4o-mini / Claude Haiku 4.5 / Gemini 2.5 Flash (proposers), ViT5-large (routing), PhoBERT (BERTScore).

### 2.2. Metrics đánh giá tóm tắt (Axis A)

- **2.2.1.** ROUGE-1/2/L: công thức precision/recall/F1, ưu nhược điểm với tiếng Việt.
- **2.2.2.** BLEU: modified n-gram precision + brevity penalty.
- **2.2.3.** BERTScore với PhoBERT (vinai/phobert-base): cosine similarity giữa contextual embeddings; ưu điểm ngữ nghĩa so với lexical metrics.
- **2.2.4.** Compression Rate: tỷ lệ nén token; trade-off giữa nén cao và mất thông tin.
- **2.2.5.** Giới hạn phương pháp: các metric trên đo content retention từ nguồn, không đo summary quality — caveat cốt lõi của khóa luận.

### 2.3. LLM-as-Judge methodology (Axis B)

- **2.3.1.** Rubric evaluation (FLASK-derived): 5 chiều: faithfulness, coverage, fluency, conciseness, overall; thang 1–5; Vietnamese journalism prompt.
- **2.3.2.** Absolute scoring (MT-Bench style): điểm holistic 1–10.
- **2.3.3.** Pairwise preference (AlpacaEval style): A vs B; position randomization để kiểm soát position bias; sign test p-value.
- **2.3.4.** Length-bucketed win rate (Dubois 2024): kiểm soát length bias; 3 bucket (<0.85, 0.85–1.15, >1.15).

### 2.4. Đánh giá factuality

Claim splitting → entailment classification (entailed / contradicted / not_mentioned) qua gpt-4o-mini; hallucination counting.

### 2.5. Human evaluation & inter-rater agreement (Axis C)

Blind K-way ranking; Fleiss κ (κ ≥ 0.4 = moderate agreement, ngưỡng publishable); per-approach average rank và win rate.

### 2.6. Content extraction

Mozilla Readability + JSDOM; xử lý đặc thù các trang báo Việt Nam (Shadow DOM, custom web components VnExpress, Cloudflare-protected sites).

### 2.7. Search-Augmented Generation cho fact-checking

Tavily API: web search → evidence retrieval → LLM verdict; kiến trúc RAG cho verification.

### 2.8. Phát triển tiện ích trình duyệt

Chrome Extension Manifest V3: service worker, content scripts, permissions model; Shadow DOM isolation; Plasmo framework (React + TypeScript + hot reload).

### 2.9. Tổng kết chương

---

## Chương 3. Thiết kế và xây dựng hệ thống

### 3.1. Phân tích yêu cầu

- **Chức năng:** tóm tắt, streaming, fact-check, multi-model switching, evaluation metrics, MoA fusion, human eval admin.
- **Phi chức năng:** latency, scalability, API key security, cross-browser compatibility, cost tracking.

### 3.2. Kiến trúc hệ thống

Sơ đồ tổng quan 3 service: Extension → Backend API → BERTScore Microservice; giao tiếp REST + SSE; Supabase PostgreSQL làm persistence layer.

- **3.2.1.** Browser Extension (Plasmo): content script inject sidebar, popup, background service worker.
- **3.2.2.** Backend API (Next.js 14 App Router): services layer, Zod validation, multi-provider LLM dispatch.
- **3.2.3.** BERTScore Microservice (FastAPI + Python): vinai/phobert-base; truncate 256 tokens; deployed HF Spaces.

### 3.3. Module tóm tắt văn bản

- **3.3.1.** Multi-provider LLM abstraction: 14+ models (OpenAI / Gemini / Anthropic / HuggingFace); per-model cost tracking; reasoning model support (o4-mini skip temperature).
- **3.3.2.** Complexity-based routing: token estimation (chars/4); short ≤400t → ViT5, medium/long → GPT-4o-mini; fallback chain; 3 routing modes (auto / forced / fusion).
- **3.3.3.** Streaming vs batch: SSE token streaming; evaluation metrics fire-and-forget async sau response.

### 3.4. MoA Output Fusion Pipeline _(đóng góp kỹ thuật chính)_

- **3.4.1.** Thiết kế hai tầng (Wang et al., 2024 Table 1): proposers chạy song song → aggregator tổng hợp.
- **3.4.2.** Proposer layer: gpt-4o-mini + claude-haiku-4-5 + gemini-2.5-flash; parallel execution; timeout handling; failure fallback.
- **3.4.3.** Aggregator layer: gpt-4o; buildAggregatorPrompt — "đánh giá phản biện, tổng hợp, KHÔNG sao chép nguyên văn, trung lập theo phong cách báo chí Việt Nam."
- **3.4.4.** Source article residual connection: original article injected vào aggregator context (Equation 1, MoA paper) để fact-checking grounding — domain adaptation so với paper gốc (instruction-following vs. grounded summarization).
- **3.4.5.** Aggregator prompt engineering: ablation study (baseline / v1-strict-source / v2-soft-source); kết luận: source presence quyết định behavior, không phải wording.

### 3.5. Module kiểm chứng sự kiện

Pipeline: text → Tavily search (6 results) → LLM claim evaluation → trust score 0–100 + verified flag + sources list.

### 3.6. Three-Axis Evaluation Framework _(đóng góp phương pháp luận chính)_

- **3.6.1.** Axis A — Content Retention: ROUGE-1/2/L, BLEU, BERTScore, Compression Rate; computed against source article; methodology caveat documented.
- **3.6.2.** Axis B — Quality & Preference: judgeRubric (5 dims) + judgeAbsolute + judgePairwise (position-randomized) + scoreFactuality; runFusionPairwiseJudge; runFusionVsAllDraftsJudge.
- **3.6.3.** Axis C — Human Validation: admin tạo task tại /evaluate/admin (ẩn model name); rater drag-rank tại /evaluate?task=uuid; aggregate Fleiss κ.
- **3.6.4.** Statistical analysis: sign test (two-sided, ties excluded); length-bucketed win rate.
- **3.6.5.** Thiết kế P0-8 (thesis-decisive): so sánh fused vs gpt-4o-alone — loại bỏ capability-gap confound (cả hai đều là gpt-4o output).

### 3.7. Thiết kế cơ sở dữ liệu

Supabase PostgreSQL; 25 migrations; bảng chính: evaluation_metrics, routing_decisions, moa_fusion_results, moa_draft_results, llm_judge_pairwise, human_eval_tasks, human_eval_responses, app_settings.

### 3.8. Giao diện người dùng

Extension sidebar (summary + fact-check modal); /metrics page (three-axis view toggle); /evaluate/admin (Create + Review tabs, κ band labels); /evaluate (rater UI tiếng Việt, drag-drop); /settings (model switching + judge config).

### 3.9. Tổng kết chương

---

## Chương 4. Thực nghiệm và đánh giá

### 4.1. Thiết lập thực nghiệm

- **4.1.1.** Dataset: 50 bài tienphong.vn; 5 chủ đề × 10 bài/chủ đề (thời sự, pháp luật, kinh tế, giáo dục, văn hóa); topic-balanced design.
- **4.1.2.** Models: proposers (gpt-4o-mini / claude-haiku-4-5 / gemini-2.5-flash), aggregator (gpt-4o), baseline (gpt-4o đơn lẻ — P0-8 design).
- **4.1.3.** Metrics: Axis A (ROUGE/BLEU/BERTScore/Compression), Axis B (rubric 5-dim / pairwise win rate / factuality entailment %), Axis C (Fleiss κ / avg rank / win rate).
- **4.1.4.** Môi trường: Next.js backend (Vercel), BERTScore microservice (HF Spaces), Supabase cloud; cost toàn bộ thực nghiệm ≈ $1.24.

### 4.2. Kết quả Axis A — Content Retention

- **4.2.1.** Bảng tổng quan: Fusion (MoA) ROUGE-1=0.421 / ROUGE-L=0.320 / BLEU=0.131 / BERTScore=0.663 — **thắng gpt-4o-alone trên mọi metric Axis A**.
- **4.2.2.** Phân tích "nghịch lý MoA": khi aggregator có source article → editorial synthesis thay vì draft-stitching → compression cao hơn → n-gram overlap tự nhiên cao hơn. Ngược lại khi aggregator không có source, compression giảm, overlap giảm. Overlap metrics trừng phạt đúng hành vi mà paper khuyến khích.
- **4.2.3.** Phân tích theo chủ đề.

### 4.3. Kết quả Axis B — Quality & Preference

- **4.3.1.** Rubric (B.1): Fusion overall 4.96 > tất cả; gap lớn nhất ở Coverage (+0.16 so với gpt-4o-alone).
- **4.3.2.** Pairwise fused vs gpt-4o-alone (B.2c — THESIS-DECISIVE): **fused 37/48 = 77.1%, p=0.0002**. Capability-gap confound dissolved — cả hai là gpt-4o output.
- **4.3.3.** Pairwise fused vs each proposer (B.2b): fused thắng gpt-4o-mini 98.0% (p<0.0001), claude-haiku-4-5 83.7% (p<0.0001), gemini-2.5-flash 69.6% (p=0.0114). Length-bucketed rates xấp xỉ raw rates → length bias không giải thích kết quả.
- **4.3.4.** Factuality (B.3): claude-haiku 95.5% entailment tốt nhất; gpt-4o-alone 89.9% thấp nhất — xác nhận mode "creative" hơn khi không có MoA framework.

### 4.4. Kết quả Axis C — Human Validation

_(Thiết lập study ≥20 tasks, ≥2 raters; Fleiss κ; per-approach preference)_

### 4.5. Cross-axis analysis

Khi 3 trục đồng ý: strong evidence. Khi diverge (Axis A loss nhưng Axis B win): tìm hiểu nguyên nhân — đây là methodological contribution novel nhất.

### 4.6. Đánh giá routing mechanism

Hiệu quả phân loại độ phức tạp; fallback chain behavior; so sánh auto vs forced mode.

### 4.7. Đánh giá module kiểm chứng sự kiện

Ví dụ minh họa pipeline Tavily → claim → verdict; phân tích chất lượng search evidence; trust score distribution.

### 4.8. Thảo luận: giới hạn phương pháp luận

ROUGE/BLEU computed against source article, không phải human-written reference → đo content retention, không đo summary quality. Implication cho các nghiên cứu dùng overlap metrics đánh giá abstractive/fusion summarization.

### 4.9. Khuyến nghị

Best-draft làm default (rẻ hơn, latency thấp hơn, phù hợp skim-reading). Fusion làm opt-in "editorial mode" khi cần độ chính xác cao hơn.

### 4.10. Tổng kết chương

---

## KẾT LUẬN

**Đóng góp đạt được**

1. Hệ thống tiện ích trình duyệt hoàn chỉnh: tóm tắt (streaming + batch) + fact-check + multi-model + admin dashboard.
2. MoA pipeline (Wang et al., 2024) cho tiếng Việt: proposer–aggregator với source residual connection.
3. Three-axis evaluation framework (Axis A/B/C): giải thích tại sao overlap metrics không đủ cho MoA summarization.
4. Kết quả thực nghiệm: fused beats gpt-4o-alone 77.1% (p=0.0002); fused beats mọi proposer 69–98% với statistical significance.

**Hạn chế**
Single-domain dataset (tienphong.vn); LLM-judge là gpt-4o-mini (potential self-preference); Axis C human study quy mô nhỏ; ViT5 routing chưa được eval kỹ với MoA context.

**Hướng phát triển**
Multi-domain dataset; fine-tune mô hình tiếng Việt chuyên biệt; mở rộng raters Axis C; tích hợp proposer đa dạng hơn (local Vietnamese models); RAG-augmented proposers.

---

## TÀI LIỆU THAM KHẢO _(dự kiến)_

1. Wang, J. et al. (2024). _Mixture-of-Agents Enhances Large Language Model Capabilities._ arXiv:2406.04692.
2. Vaswani, A. et al. (2017). _Attention Is All You Need._ NeurIPS.
3. Lin, C.-Y. (2004). _ROUGE: A Package for Automatic Evaluation of Summaries._ ACL Workshop.
4. Zhang, T. et al. (2020). _BERTScore: Evaluating Text Generation with BERT._ ICLR.
5. Nguyen, D. Q. et al. (2020). _PhoBERT: Pre-trained language models for Vietnamese._ EMNLP Findings.
6. Dubois, Y. et al. (2024). _Length-Controlled AlpacaEval._ arXiv:2404.04475.
7. Ye, S. et al. (2023). _FLASK: Fine-grained Language Model Evaluation._ arXiv:2307.10928.
8. Zheng, L. et al. (2023). _Judging LLM-as-a-Judge with MT-Bench._ NeurIPS.
9. Nguyen, C. et al. (2022). _ViT5: Pretrained Text-to-Text Transformer for Vietnamese._ arXiv.
10. Li, D. et al. (2021). _Prefix-Tuning: Optimizing Continuous Prompts for Generation._ ACL.
11. Phan, L. T. et al. (2022). _PhoGPT: Generative Pre-training for Vietnamese._ (VinAI Research.)
12. Landis, J. R. & Koch, G. G. (1977). _The Measurement of Observer Agreement for Categorical Data._ Biometrics.

---

## PHỤ LỤC

**A.** Ví dụ tóm tắt: bài gốc + drafts (gpt-4o-mini / claude-haiku / gemini-flash) + fused output.

**B.** Ví dụ kiểm chứng sự kiện: claims trích xuất, nguồn Tavily, verdict từng claim.

**C.** Bảng kết quả đánh giá đầy đủ: ROUGE/BLEU/BERTScore cho 50 bài × 4 approaches.

**D.** Unified three-axis report (output từ `npm run report:unified`).

**E.** Aggregator prompt engineering ablation: baseline vs v1-strict vs v2-soft.

**F.** Hướng dẫn cài đặt: backend, extension, BERTScore service, biến môi trường.
