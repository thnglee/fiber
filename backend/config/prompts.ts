/**
 * Prompt Templates
 * Centralized prompt management for AI interactions
 * 
 * These templates use placeholders that will be replaced with actual values
 * when generating prompts. This allows for easy modification and testing
 * without changing route handlers.
 */

export interface FactCheckPromptParams {
  text: string
  sourceContent: string
}

export interface SummarizePromptParams {
  content: string
}

/**
 * Generate fact-check prompt
 * @param params - Parameters to fill in the prompt template
 * @returns Complete prompt string ready for LLM
 */
export function getFactCheckPrompt(params: FactCheckPromptParams): string {
  const { text, sourceContent } = params
  
  return `Bạn là một chuyên gia kiểm tra thông tin. Hãy đánh giá độ tin cậy của câu sau dựa trên các nguồn tham khảo được cung cấp.

Câu cần kiểm tra: "${text}"

Nguồn tham khảo:
${sourceContent || "Không tìm thấy nguồn tham khảo phù hợp"}

Yêu cầu:
1. Đánh giá độ tin cậy từ 0-100 (0 = hoàn toàn sai, 100 = hoàn toàn đúng)
2. Giải thích ngắn gọn lý do (2-3 câu)
3. Xác định xem thông tin có được xác minh bởi các nguồn uy tín không

Trả về với các trường sau:
- score: số từ 0 đến 100
- reason: lý do ngắn gọn (2-3 câu)
- verified: true nếu được xác minh, false nếu không`
}

/**
 * Generate summarize prompt
 * @param params - Parameters to fill in the prompt template
 * @returns Complete prompt string ready for LLM
 */
export function getSummarizePrompt(params: SummarizePromptParams): string {
  const { content } = params
  const contentPreview = content.substring(0, 10000) // Limit to 10k chars
  
  return `Bạn là một trợ lý AI chuyên tóm tắt và phân loại tin tức tiếng Việt.

Nhiệm vụ: Tóm tắt bài viết sau một cách ngắn gọn, chính xác và dễ hiểu, sau đó phân loại và ước tính thời gian đọc.

Yêu cầu cụ thể:
1. Tóm tắt (summary): Viết tóm tắt nội dung chính trong 2-3 đoạn văn ngắn.
2. Thể loại (category): Xác định thể loại chính của bài viết. Nếu bài viết thuộc một trong các lĩnh vực sau, hãy sử dụng:
   - Chính trị - Xã hội
   - Kinh tế - Tài chính
   - Công nghệ - Khoa học
   - Sức khỏe - Y tế
   - Văn hóa - Giải trí
   - Thể thao
   - Giáo dục
   - Du lịch - Ẩm thực
   - Môi trường - Biến đổi Khí hậu
   - Pháp luật - Tội phạm
   - Quân sự - Quốc phòng
   Nếu không thuộc các lĩnh vực trên, hãy chọn một **thể loại phù hợp nhất** và trả về (ví dụ: Lịch sử, Bất động sản, Nhân sự). Trả về chỉ một giá trị chuỗi.
3. Thời gian đọc (readingTime): Ước tính thời gian đọc bài viết (tính bằng phút, làm tròn lên số nguyên gần nhất).

Bài viết cần xử lý:
${contentPreview}

Định dạng đầu ra:
Hãy trả về kết quả dưới định dạng JSON, có cấu trúc như sau:

{
  "summary": "tóm tắt ngắn gọn (2-3 đoạn văn)",
  "category": "thể loại của bài viết (chuỗi)",
  "readingTime": "thời gian đọc ước tính (số phút, là một số nguyên)"
}
`;
}
