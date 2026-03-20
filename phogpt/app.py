import json
import re
import logging
import spaces
import gradio as gr
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("phogpt_service")

MODEL_NAME = "vinai/PhoGPT-4B-Chat"
INPUT_CHAR_LIMIT = 6000  # ~1500 tokens — safe for 8192 context with prompt+output room

# Global model/tokenizer — loaded once on first GPU call
tokenizer = None
model = None


def load_model():
    """Load model and tokenizer into global scope (called once)."""
    global tokenizer, model
    if model is not None:
        return
    logger.info(f"Loading {MODEL_NAME}...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_NAME,
        trust_remote_code=True,
        torch_dtype=torch.float16,
    )
    logger.info(f"{MODEL_NAME} loaded successfully.")


def build_prompt(content: str) -> str:
    """
    Build Vietnamese summarization prompt using PhoGPT's chat format.

    Prompt content mirrors backend/config/prompts.ts getSummarizePrompt() exactly
    (same categories, same instructions), but wrapped in PhoGPT's
    ### Câu hỏi: / ### Trả lời: template.
    """
    truncated = content[:INPUT_CHAR_LIMIT]
    return f"""### Câu hỏi:
Bạn là một trợ lý AI chuyên tóm tắt và phân loại tin tức tiếng Việt.

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
   Nếu không thuộc các lĩnh vực trên, hãy chọn một thể loại phù hợp nhất và trả về (ví dụ: Lịch sử, Bất động sản, Nhân sự). Trả về chỉ một giá trị chuỗi.
3. Thời gian đọc (readingTime): Ước tính thời gian đọc bài viết (tính bằng phút, làm tròn lên số nguyên gần nhất).

Bài viết cần xử lý:
{truncated}

Định dạng đầu ra:
Hãy trả về kết quả dưới định dạng JSON, có cấu trúc như sau:

{{"summary": "tóm tắt ngắn gọn (2-3 đoạn văn)", "category": "thể loại của bài viết (chuỗi)", "readingTime": "thời gian đọc ước tính (số phút, là một số nguyên)"}}

### Trả lời:
"""


def parse_response(raw: str) -> dict:
    """Extract JSON from PhoGPT's output, with fallbacks."""
    # Try direct JSON parse
    try:
        parsed = json.loads(raw.strip())
        if isinstance(parsed, dict) and "summary" in parsed:
            # Ensure readingTime is int
            if "readingTime" in parsed:
                try:
                    parsed["readingTime"] = int(parsed["readingTime"])
                except (ValueError, TypeError):
                    parsed["readingTime"] = 1
            return parsed
    except json.JSONDecodeError:
        pass

    # Try extracting JSON block from surrounding text
    json_match = re.search(r'\{[^{}]*"summary"\s*:', raw, re.DOTALL)
    if json_match:
        # Find the matching closing brace
        start = json_match.start()
        depth = 0
        for i in range(start, len(raw)):
            if raw[i] == '{':
                depth += 1
            elif raw[i] == '}':
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(raw[start:i + 1])
                    except json.JSONDecodeError:
                        break

    # Fallback: use raw text as summary
    clean = raw.strip()
    if clean.startswith('"') and clean.endswith('"'):
        clean = clean[1:-1]
    return {
        "summary": clean[:2000] if clean else "Không thể tóm tắt.",
        "category": "Khác",
        "readingTime": 1,
    }


@spaces.GPU
def summarize(article_text: str) -> str:
    """Summarize Vietnamese article text using PhoGPT-4B-Chat.

    Args:
        article_text: Raw article content (NOT a pre-formatted prompt).

    Returns:
        JSON string with keys: summary, category, readingTime
    """
    load_model()

    if not article_text or not article_text.strip():
        return json.dumps({"error": "Empty input"})

    prompt = build_prompt(article_text)

    input_ids = tokenizer(prompt, return_tensors="pt").to(model.device)

    with torch.no_grad():
        outputs = model.generate(
            **input_ids,
            max_new_tokens=1024,
            do_sample=True,
            temperature=0.7,
            top_p=0.95,
            repetition_penalty=1.1,
            eos_token_id=tokenizer.eos_token_id,
        )

    # Decode only the generated tokens (skip the prompt)
    generated = outputs[0][input_ids["input_ids"].shape[1]:]
    raw_output = tokenizer.decode(generated, skip_special_tokens=True)

    logger.info(f"Generated {len(raw_output)} chars")

    result = parse_response(raw_output)
    return json.dumps(result, ensure_ascii=False)


# Health check
def health():
    return json.dumps({
        "status": "ok",
        "model": MODEL_NAME,
        "model_loaded": model is not None,
    })


# Gradio interface
with gr.Blocks() as demo:
    gr.Markdown("# PhoGPT Vietnamese News Summarizer")
    gr.Markdown(f"Model: `{MODEL_NAME}` on ZeroGPU")

    with gr.Row():
        input_text = gr.Textbox(
            label="Article Text",
            placeholder="Paste Vietnamese news article here...",
            lines=10,
        )
        output_text = gr.Textbox(label="Summary (JSON)", lines=10)

    summarize_btn = gr.Button("Summarize", variant="primary")
    summarize_btn.click(fn=summarize, inputs=input_text, outputs=output_text, api_name="summarize")

    health_btn = gr.Button("Health Check")
    health_output = gr.Textbox(label="Health")
    health_btn.click(fn=health, outputs=health_output, api_name="health")

demo.launch()
