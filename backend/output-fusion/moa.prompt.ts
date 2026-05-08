/**
 * MoA Aggregator Prompt — translated from Wang et al. (2024), "Mixture-of-Agents
 * Enhances Large Language Model Capabilities" (arXiv:2406.04692), Table 1
 * (Aggregate-and-Synthesize prompt, p. 4).
 *
 * Two intentional domain adaptations from the paper's English instruction-following
 * prompt to Vietnamese news summarization:
 *
 *   (1) Vietnamese journalism style — added clause "trung lập theo phong cách
 *       báo chí Việt Nam" so the aggregator produces neutral, news-register Vietnamese
 *       rather than literal-translation prose.
 *
 *   (2) Source article as residual connection — the original article is injected
 *       alongside proposer drafts (Equation 1 in the paper). The paper's prompt
 *       has no source material because AlpacaEval / MT-Bench / FLASK are
 *       open-ended instruction-following, not grounded summarization. For news
 *       summarization the source is the ground truth and must be available for
 *       fact-checking; the falsification batch on branch `fix/moa-aggregator-source-prompt`
 *       confirmed source presence is required for factuality even though it
 *       depresses overlap metrics.
 *
 * All other Table 1 keywords (synthesize / critically evaluate / not simply
 * replicate / refined-accurate-comprehensive / well-structured-coherent /
 * highest standards) are translated directly. The alignment test
 * `__tests__/moa.prompt.alignment.test.ts` enforces this.
 */

const DRAFT_CHAR_LIMIT = 3_000
const ARTICLE_CHAR_LIMIT = 5_000

export interface AggregatorDraft {
  model_name: string
  summary: string
}

export function buildAggregatorPrompt(
  originalArticle: string,
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

  // Residual connection (Equation 1 in MoA paper): pass the original article
  // alongside proposer outputs so the aggregator can fact-check against the source.
  const articleSnippet =
    originalArticle.length > ARTICLE_CHAR_LIMIT
      ? originalArticle.substring(0, ARTICLE_CHAR_LIMIT) + "\n[... đã cắt bớt ...]"
      : originalArticle

  return `Bạn đã được cung cấp một tập các bản tóm tắt do nhiều mô hình ngôn ngữ khác nhau đề xuất cho cùng một bài báo tiếng Việt. Nhiệm vụ của bạn là tổng hợp các bản tóm tắt này thành một bản tóm tắt cuối cùng duy nhất, chất lượng cao nhất.

Điều quan trọng là phải đánh giá có phản biện những thông tin trong các bản tóm tắt được đề xuất, nhận thức rằng một số thông tin có thể bị thiên lệch hoặc sai lệch. Bản tóm tắt của bạn KHÔNG nên chỉ sao chép nguyên văn các bản tóm tắt được đưa ra; thay vào đó hãy đưa ra một câu trả lời đã được tinh chỉnh, chính xác và toàn diện. Đảm bảo bản tóm tắt có cấu trúc tốt, mạch lạc, trung lập theo phong cách báo chí Việt Nam, và tuân thủ tiêu chuẩn cao nhất về độ chính xác và độ tin cậy.

Hãy đối chiếu các bản tóm tắt với bài viết gốc bên dưới để đảm bảo tính chính xác về sự kiện. Không bịa thông tin không có trong bài gốc; còn lại hãy viết đầy đủ ý, không bị cắt ngắn.

Bài viết gốc (để đối chiếu):
"""
${articleSnippet}
"""

Các bản tóm tắt do các mô hình đề xuất:
${draftBlocks}

Sau khi tổng hợp, hãy phân loại bài viết và ước tính thời gian đọc.

Yêu cầu đầu ra (JSON có cấu trúc, đúng schema):
- summary: Bản tóm tắt tổng hợp cuối cùng (tiếng Việt). Viết đầy đủ ý từ bài gốc, không tự cắt ngắn.
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
