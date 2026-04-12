# Email Báo Cáo Tiến Độ

**Gửi:** Cô Vương Thị Hồng

---

Gửi cô Hồng,

Em xin phép báo cáo tiến độ thực nghiệm và kế hoạch viết khóa luận ạ.

## 1. Tiến độ thực nghiệm

**Về cơ chế Routing và chế độ Evaluation:**
Hệ thống hiện tại đã hoàn thiện cơ chế routing tự động chọn model phù hợp dựa trên độ phức tạp của bài viết, cùng với chế độ evaluation cho phép so sánh đồng thời kết quả tóm tắt từ nhiều model bằng các metrics ROUGE, BLEU, và BERTScore.

**Về các model tiếng Việt:**
- **PhoGPT-4B-Chat (vinai/PhoGPT-4B-Chat):** Em đã hoàn thiện toàn bộ code tích hợp (Gradio microservice + backend), tuy nhiên chưa thể triển khai do ZeroGPU trên HuggingFace Spaces yêu cầu tài khoản Pro (9$/tháng). Em cũng đã tìm hiểu phương án thay thế trên Modal.com nhưng vẫn gặp khó khăn về hạ tầng GPU miễn phí.
- **Vistral (Viet-Mistral):** Em đã chuyển sang thử nghiệm model Vistral như một phương án thay thế, tuy nhiên cũng gặp vấn đề tương tự về hosting do yêu cầu GPU.
- **Kết quả hiện tại:** Chế độ evaluation hoạt động ổn định với 2 model: **GPT-4o** (default) và **ViT5** (VietAI/vit5-large-vietnews-summarization qua HuggingFace Inference API). Kết quả đánh giá cho thấy **ViT5 đạt điểm BERTScore cao hơn GPT-4o** trên tập dữ liệu tin tức tiếng Việt, đây là một phát hiện có giá trị cho khóa luận.

Em đã thực nghiệm trên 5 chủ đề (thời sự, pháp luật, kinh tế, giáo dục, văn hóa) với cả 3 model (GPT-4o, GPT-4o-mini, ViT5) và có dữ liệu so sánh chi tiết.

## 2. Kế hoạch viết khóa luận

Theo yêu cầu của cô, em xin gửi kèm outline/mục lục chi tiết các phần em dự định viết (tuân theo mẫu trình bày KLTN của Khoa/Trường, chương trình CLC). Em sẽ viết bằng LaTeX.

*(Đính kèm: Outline chi tiết)*

Em xin cảm ơn cô ạ.

Trân trọng,
Lê Văn Thắng
22028313
