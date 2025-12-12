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
  
  return `Bạn là một trợ lý AI chuyên tóm tắt tin tức tiếng Việt. Hãy tóm tắt bài viết sau đây một cách ngắn gọn, chính xác và dễ hiểu.

Yêu cầu:
1. Tóm tắt trong 2-3 đoạn văn ngắn
2. Liệt kê 3-5 điểm chính dưới dạng bullet points
3. Ước tính thời gian đọc (tính bằng phút, dựa trên độ dài bài viết)

Bài viết:
${contentPreview}

Trả về với các trường sau:
- summary: tóm tắt ngắn gọn (2-3 đoạn văn)
- keyPoints: mảng các điểm chính (3-5 điểm)
- readingTime: thời gian đọc ước tính (số phút)`
}
