const ARTICLE_CHAR_LIMIT = 10_000
const DRAFT_CHAR_LIMIT = 3_000

export interface AggregatorDraft {
  model_name: string
  summary: string
}

export function buildAggregatorPrompt(
  originalArticle: string,
  drafts: AggregatorDraft[],
): string {
  const articlePreview =
    originalArticle.length > ARTICLE_CHAR_LIMIT
      ? originalArticle.substring(0, ARTICLE_CHAR_LIMIT)
      : originalArticle

  const draftBlocks = drafts
    .map((draft, index) => {
      const trimmed =
        draft.summary.length > DRAFT_CHAR_LIMIT
          ? draft.summary.substring(0, DRAFT_CHAR_LIMIT)
          : draft.summary
      return `Bản tóm tắt #${index + 1} — mô hình: ${draft.model_name}\n"""\n${trimmed}\n"""`
    })
    .join("\n\n")

  return `Bạn là một biên tập viên báo chí cao cấp tại một toà soạn lớn ở Việt Nam. Nhiệm vụ của bạn là tổng hợp nhiều bản tóm tắt được các mô hình AI khác nhau đề xuất thành một bản tóm tắt cuối cùng duy nhất, chất lượng cao nhất.

Nguyên tắc tổng hợp:
1. Giữ lại những thông tin có mặt trong bài báo gốc và được nhiều bản tóm tắt đồng thuận.
2. Loại bỏ thông tin mâu thuẫn, sai lệch, hoặc không xuất hiện trong bài báo gốc (tránh "bịa đặt").
3. Ưu tiên cách diễn đạt mạch lạc, chính xác và trung lập của báo chí Việt Nam.
4. Không sao chép nguyên văn một bản tóm tắt; hãy tổng hợp các ý tốt nhất.
5. Bản tóm tắt cuối cùng phải bám sát nội dung bài báo gốc, không đưa thêm quan điểm cá nhân.

Bài báo gốc (nguồn sự thật duy nhất):
"""
${articlePreview}
"""

Các bản tóm tắt đề xuất từ những mô hình khác nhau:
${draftBlocks}

Hãy tạo bản tóm tắt cuối cùng dựa trên các nguyên tắc trên, sau đó phân loại và ước tính thời gian đọc.

Yêu cầu đầu ra (JSON có cấu trúc, đúng schema):
- summary: Tóm tắt cuối cùng (2–3 đoạn văn ngắn, tiếng Việt, trung lập, chính xác).
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
