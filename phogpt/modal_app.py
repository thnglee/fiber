import json
import re
import logging
import modal

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("phogpt_service")

MODEL_NAME = "vinai/PhoGPT-4B-Chat"
INPUT_CHAR_LIMIT = 6000  # ~1500 tokens — safe for 8192 context with prompt+output room

# ---------------------------------------------------------------------------
# Modal image: install deps + bake model weights at build time
# ---------------------------------------------------------------------------

def download_model():
    """Download model weights into the image at build time.

    Uses snapshot_download instead of from_pretrained to avoid loading
    PhoGPT's custom modeling code (which requires flash_attn_triton at
    import time). The actual model loading happens at runtime with GPU.
    """
    from huggingface_hub import snapshot_download
    snapshot_download(MODEL_NAME)

image = (
    modal.Image.from_registry("nvidia/cuda:12.1.0-devel-ubuntu22.04", add_python="3.11")
    .apt_install("git")
    .run_commands("pip install --upgrade pip setuptools wheel packaging ninja")
    .run_commands(
        "pip install torch --index-url https://download.pytorch.org/whl/cu121"
    )
    .pip_install(
        "transformers",
        "accelerate",
        "einops",
        "huggingface_hub",
        "fastapi[standard]",
        "triton",
    )
    .run_commands(
        "pip install flash-attn --no-build-isolation",
        gpu="T4",
    )
    .run_function(download_model)
)

app = modal.App("phogpt-summarizer", image=image)

# ---------------------------------------------------------------------------
# Prompt + parsing (identical to Gradio version)
# ---------------------------------------------------------------------------

def build_prompt(content: str) -> str:
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
    try:
        parsed = json.loads(raw.strip())
        if isinstance(parsed, dict) and "summary" in parsed:
            if "readingTime" in parsed:
                try:
                    parsed["readingTime"] = int(parsed["readingTime"])
                except (ValueError, TypeError):
                    parsed["readingTime"] = 1
            return parsed
    except json.JSONDecodeError:
        pass

    json_match = re.search(r'\{[^{}]*"summary"\s*:', raw, re.DOTALL)
    if json_match:
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

    clean = raw.strip()
    if clean.startswith('"') and clean.endswith('"'):
        clean = clean[1:-1]
    return {
        "summary": clean[:2000] if clean else "Không thể tóm tắt.",
        "category": "Khác",
        "readingTime": 1,
    }


# ---------------------------------------------------------------------------
# Modal class: loads model once per container, serves requests
# ---------------------------------------------------------------------------

@app.cls(gpu="T4", container_idle_timeout=120)
class PhoGPTModel:
    @modal.enter()
    def load(self):
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        logger.info(f"Loading {MODEL_NAME} onto GPU...")
        self.tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, trust_remote_code=True)
        self.model = AutoModelForCausalLM.from_pretrained(
            MODEL_NAME,
            trust_remote_code=True,
            torch_dtype=torch.float16,
            device_map="auto",
        )
        logger.info(f"{MODEL_NAME} loaded successfully.")

    @modal.fastapi_endpoint(method="POST")
    async def summarize(self, request: dict):
        import torch

        article_text = request.get("article_text", "")
        if not article_text or not article_text.strip():
            return {"error": "Empty input"}

        prompt = build_prompt(article_text)
        input_ids = self.tokenizer(prompt, return_tensors="pt").to(self.model.device)

        with torch.no_grad():
            outputs = self.model.generate(
                **input_ids,
                max_new_tokens=1024,
                do_sample=True,
                temperature=0.7,
                top_p=0.95,
                repetition_penalty=1.1,
                eos_token_id=self.tokenizer.eos_token_id,
            )

        generated = outputs[0][input_ids["input_ids"].shape[1]:]
        raw_output = self.tokenizer.decode(generated, skip_special_tokens=True)

        logger.info(f"Generated {len(raw_output)} chars")

        result = parse_response(raw_output)
        return result

    @modal.fastapi_endpoint(method="GET")
    async def health(self):
        return {
            "status": "ok",
            "model": MODEL_NAME,
            "gpu": "T4",
        }
