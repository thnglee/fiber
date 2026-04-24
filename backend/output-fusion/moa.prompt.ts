const DRAFT_CHAR_LIMIT = 3_000
const ARTICLE_CHAR_LIMIT = 16_000

export interface AggregatorDraft {
  model_name: string
  summary: string
}

export function buildAggregatorPrompt(
  originalArticle: string,
  drafts: AggregatorDraft[],
): string {
  const trimmedArticle =
    originalArticle.length > ARTICLE_CHAR_LIMIT
      ? originalArticle.substring(0, ARTICLE_CHAR_LIMIT)
      : originalArticle

  const draftBlocks = drafts
    .map((draft, index) => {
      const trimmed =
        draft.summary.length > DRAFT_CHAR_LIMIT
          ? draft.summary.substring(0, DRAFT_CHAR_LIMIT)
          : draft.summary
      return `${index + 1}. [Mô hình ${draft.model_name}]\n"""\n${trimmed}\n"""`
    })
    .join("\n\n")

  return `Bạn đã được cung cấp BÀI BÁO GỐC tiếng Việt và một tập các bản tóm tắt do nhiều mô hình ngôn ngữ khác nhau đề xuất cho bài báo đó. Nhiệm vụ của bạn là tổng hợp thành một bản tóm tắt cuối cùng duy nhất, chất lượng cao nhất.

Quy tắc bắt buộc:
1. BÀI BÁO GỐC là nguồn thông tin DUY NHẤT có giá trị. Tuyệt đối không đưa vào bản tóm tắt cuối cùng bất kỳ thông tin, số liệu, tên người, địa điểm hoặc luận điểm nào KHÔNG có trong bài báo gốc — kể cả khi các bản tóm tắt đề xuất có đề cập đến.
2. Đánh giá có phản biện các bản tóm tắt đề xuất: một số có thể bị sai lệch, thiên lệch, hoặc bổ sung thông tin không có trong bài báo gốc. Loại bỏ mọi thông tin như vậy.
3. Chọn lọc những diễn đạt, thuật ngữ và cách trình bày tốt nhất từ các bản tóm tắt đề xuất, miễn là chúng trung thành với bài báo gốc.
4. Bản tóm tắt cuối cùng phải trung lập theo phong cách báo chí Việt Nam, mạch lạc, chính xác, và bám sát nội dung bài báo gốc.

Yêu cầu về độ dài: cô đọng, tối đa 150 từ.

BÀI BÁO GỐC:
"""
${trimmedArticle}
"""

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
