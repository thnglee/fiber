const DRAFT_CHAR_LIMIT = 3_000

export interface AggregatorDraft {
  model_name: string
  summary: string
}

export function buildAggregatorPrompt(
  _originalArticle: string,
  drafts: AggregatorDraft[],
): string {
  const draftBlocks = drafts
    .map((draft, index) => {
      const trimmed =
        draft.summary.length > DRAFT_CHAR_LIMIT
          ? draft.summary.substring(0, DRAFT_CHAR_LIMIT)
          : draft.summary
      return `${index + 1}. [Mô hình ${draft.model_name}]\n"""\n${trimmed}\n"""`
    })
    .join("\n\n")

  return `Bạn đã được cung cấp một tập các bản tóm tắt do nhiều mô hình ngôn ngữ khác nhau đề xuất cho cùng một bài báo tiếng Việt. Nhiệm vụ của bạn là tổng hợp các bản tóm tắt này thành một bản tóm tắt cuối cùng duy nhất, chất lượng cao nhất.

Điều quan trọng là phải đánh giá có phản biện những thông tin trong các bản tóm tắt được đề xuất, nhận thức rằng một số thông tin có thể bị thiên lệch hoặc sai lệch. Bản tóm tắt của bạn KHÔNG nên chỉ sao chép nguyên văn các bản tóm tắt được đưa ra; thay vào đó hãy đưa ra một câu trả lời đã được tinh chỉnh, chính xác và toàn diện. Đảm bảo bản tóm tắt có cấu trúc tốt, mạch lạc, trung lập theo phong cách báo chí Việt Nam, và tuân thủ tiêu chuẩn cao nhất về độ chính xác và độ tin cậy.

Yêu cầu về độ dài: cô đọng, tối đa 150 từ.

Các bản tóm tắt do các mô hình đề xuất:
${draftBlocks}

Sau khi tổng hợp, hãy phân loại bài viết và ước tính thời gian đọc.

Yêu cầu đầu ra (JSON có cấu trúc, đúng schema):
- summary: Bản tóm tắt tổng hợp cuối cùng (tiếng Việt, tối đa 150 từ).
- category: Thể loại chính của bài viết. Nếu phù hợp, dùng một trong các giá trị sau:
  * Chính trị - Xã hội
  * Kinh tế - Tài chính
  * Công nghệ - Khoa học
  * Sức khỏe - Y tế
  * Văn hóa - Giải trí
  * Thể thao
  * Giáo dục
  * Du lịch - Ẩm thực
  * Môi trường - Biến đổi Khí hậu
  * Pháp luật - Tội phạm
  * Quân sự - Quốc phòng
  Nếu không phù hợp, chọn thể loại phù hợp nhất dưới dạng chuỗi ngắn.
- readingTime: Thời gian đọc ước tính (số phút, số nguyên, làm tròn lên).

Định dạng trả về (JSON):
{
  "summary": "bản tóm tắt tổng hợp cuối cùng",
  "category": "thể loại",
  "readingTime": 3
}
`
}
