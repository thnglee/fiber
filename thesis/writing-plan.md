# Plan Viết Khóa Luận Chi Tiết

> Mỗi session, ra lệnh viết theo từng task bên dưới. Mỗi task tương ứng 1 phần LaTeX cần hoàn thiện.

---

## Phase 1: Cơ sở lý thuyết (Chương 2) — Viết trước vì ít phụ thuộc dữ liệu

### Task 1.1: Viết mục 2.1 — Mô hình ngôn ngữ lớn
- **File:** `chapters/chapter2.tex` → section 2.1
- **Nội dung:**
  - 2.1.1: Kiến trúc Transformer (self-attention, multi-head, encoder-decoder) — kèm hình vẽ TikZ
  - 2.1.2: Phân loại các pretrained models (BERT, GPT, T5)
  - 2.1.3: Mô tả chi tiết 4 models: GPT-4o, ViT5, PhoBERT, PhoGPT — bảng so sánh thông số
- **Nguồn tham khảo:** Vaswani 2017, Devlin 2019, Raffel 2020, PhoBERT paper, ViT5 paper
- **Ước lượng:** ~5-6 trang

### Task 1.2: Viết mục 2.2 — Các phương pháp đánh giá
- **File:** `chapters/chapter2.tex` → section 2.2
- **Nội dung:**
  - ROUGE (công thức Precision/Recall/F1, variants), BLEU (n-gram precision, brevity penalty)
  - BERTScore: cosine similarity embeddings, PhoBERT adaptation, truncation 256 tokens
  - Compression Rate formula
- **Nguồn tham khảo:** Lin 2004, Papineni 2002, Zhang 2020
- **Ước lượng:** ~3-4 trang

### Task 1.3: Viết mục 2.3-2.5 — Content extraction, RAG, Browser extension
- **File:** `chapters/chapter2.tex` → sections 2.3, 2.4, 2.5
- **Nội dung:**
  - Mozilla Readability + DOM parsing
  - RAG architecture + Tavily Search
  - Manifest V3, Plasmo, Shadow DOM
- **Ước lượng:** ~3-4 trang

---

## Phase 2: Tổng quan (Chương 1) — Khảo sát tài liệu

### Task 2.1: Viết mục 1.1 — Bài toán tóm tắt văn bản
- **File:** `chapters/chapter1.tex` → section 1.1
- **Nội dung:**
  - Định nghĩa, phân loại (extractive vs abstractive)
  - Các phương pháp (thống kê → ML → LLM)
  - Đặc thù tiếng Việt: từ ghép, thiếu corpus, các nghiên cứu hiện có
- **Cần tìm thêm:** papers về Vietnamese text summarization, thống kê báo điện tử VN
- **Ước lượng:** ~4-5 trang

### Task 2.2: Viết mục 1.2 — Bài toán kiểm chứng tin tức
- **File:** `chapters/chapter1.tex` → section 1.2
- **Nội dung:**
  - Fake news definition, tác động xã hội VN
  - Automated fact verification methods
  - Search-augmented approach
- **Ước lượng:** ~3-4 trang

### Task 2.3: Viết mục 1.3 — Các công trình liên quan + Tổng kết
- **File:** `chapters/chapter1.tex` → section 1.3 + 1.4
- **Nội dung:**
  - Khảo sát hệ thống tóm tắt tin tức hiện có
  - Công cụ fact-check, browser extensions
  - Xác định khoảng trống → đóng góp của khóa luận
- **Ước lượng:** ~3-4 trang

---

## Phase 3: Thiết kế hệ thống (Chương 3) — Dựa trên code thực tế

### Task 3.1: Viết mục 3.1-3.2 — Phân tích yêu cầu + Kiến trúc tổng quan
- **File:** `chapters/chapter3.tex` → sections 3.1, 3.2
- **Nội dung:**
  - Bảng yêu cầu chức năng/phi chức năng
  - Sơ đồ kiến trúc 3 thành phần (TikZ diagram)
  - Mô tả từng thành phần: Extension, Backend, BERTScore service
- **Cần đọc:** `backend/services/`, `extension/contents/`, `bert/`
- **Ước lượng:** ~5-6 trang

### Task 3.2: Viết mục 3.3 — Thiết kế chi tiết các module
- **File:** `chapters/chapter3.tex` → section 3.3
- **Nội dung:**
  - Module tóm tắt: sequence diagram, prompt engineering
  - Module fact-check: pipeline, trust scoring
  - Multi-provider LLM: bảng 14 models, provider abstraction
  - Routing mechanism: flowchart, complexity classification
  - Evaluation module: parallel execution, BERTScore selection
- **Cần đọc:** `summarize.service.ts`, `fact-check.service.ts`, `llm.service.ts`, `routing.service.ts`
- **Ước lượng:** ~8-10 trang (phần lớn nhất)

### Task 3.3: Viết mục 3.4-3.6 — Database, UI, tổng kết
- **File:** `chapters/chapter3.tex` → sections 3.4, 3.5, 3.6
- **Nội dung:**
  - ER diagram, mô tả bảng
  - Screenshots UI (sidebar, fact-check, settings, metrics)
  - Tổng kết thiết kế
- **Cần:** chụp screenshots hệ thống
- **Ước lượng:** ~4-5 trang

---

## Phase 4: Thực nghiệm (Chương 4) — Dựa trên dữ liệu metrics_reports/

### Task 4.1: Viết mục 4.1-4.2 — Setup + Kết quả tổng quan
- **File:** `chapters/chapter4.tex` → sections 4.1, 4.2
- **Nội dung:**
  - Mô tả dataset 50 bài, 5 chủ đề
  - Bảng thống kê, môi trường thực nghiệm
  - Bảng kết quả trung bình: GPT-4o vs GPT-4o-mini vs ViT5
  - Biểu đồ radar, bar charts (pgfplots)
- **Cần xử lý:** parse CSV files từ `metrics_reports/results/`
- **Ước lượng:** ~5-6 trang

### Task 4.2: Viết mục 4.3-4.4 — Phân tích BERTScore + Routing
- **File:** `chapters/chapter4.tex` → sections 4.3, 4.4 (phần phân tích BERTScore, compression, routing)
- **Nội dung:**
  - **KEY FINDING:** ViT5 > GPT-4o BERTScore — phân tích nguyên nhân
  - Extractive vs abstractive tendency
  - Scatter plots, box plots
  - Routing effectiveness analysis
- **Ước lượng:** ~4-5 trang

### Task 4.3: Viết mục 4.5-4.7 — Fact-check, hosting challenges, key findings
- **File:** `chapters/chapter4.tex` → sections 4.5, 4.6, 4.7
- **Nội dung:**
  - Fact-check quality analysis (ví dụ minh họa)
  - **Thảo luận hosting:** PhoGPT (ZeroGPU cần HF Pro), Vistral (GPU requirements), chi phí
  - 5 key findings tổng hợp
- **Ước lượng:** ~4-5 trang

---

## Phase 5: Mở đầu + Kết luận — Viết sau cùng khi đã có toàn bộ nội dung

### Task 5.1: Viết phần Mở đầu
- **File:** `chapters/introduction.tex`
- **Nội dung:**
  - Tính cấp thiết, ý nghĩa khoa học/thực tiễn
  - Đối tượng, phạm vi, phương pháp nghiên cứu
  - Cấu trúc khóa luận
- **Ước lượng:** ~3-4 trang

### Task 5.2: Viết phần Kết luận
- **File:** `chapters/conclusion.tex`
- **Nội dung:** Kết quả đạt được, hạn chế, hướng phát triển
- **Ước lượng:** ~2-3 trang

### Task 5.3: Hoàn thiện Tóm tắt (VI + EN)
- **File:** `frontmatter/abstract_vi.tex`, `frontmatter/abstract_en.tex`
- **Nội dung:** Cập nhật lại dựa trên nội dung thực tế đã viết
- **Ước lượng:** ~2 trang

---

## Phase 6: Phụ lục + Hoàn thiện

### Task 6.1: Viết Phụ lục
- **File:** `chapters/appendix.tex`
- **Nội dung:** Mẫu I/O, bảng chi tiết, hướng dẫn cài đặt

### Task 6.2: Bổ sung tài liệu tham khảo
- **File:** `references.bib`
- **Nội dung:** Thêm papers, sắp xếp theo quy định Khoa

### Task 6.3: Thêm figures
- **Thư mục:** `figures/`
- **Nội dung:** Screenshots UI, diagrams, biểu đồ

### Task 6.4: Review formatting
- Kiểm tra margins, font size, line spacing
- Kiểm tra đánh số chương/mục/hình/bảng
- Kiểm tra tài liệu tham khảo format

---

## Tổng ước lượng: ~45-55 trang nội dung (đạt yêu cầu 35-50 trang)

## Cách sử dụng plan này

Trong mỗi session mới, chỉ cần nói:
```
Viết Task X.Y theo writing plan
```

Ví dụ:
- "Viết Task 1.1 theo writing plan" → viết phần Transformer/LLM trong chapter 2
- "Viết Task 4.1 theo writing plan" → viết phần kết quả thực nghiệm
