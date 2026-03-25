import math
import logging
import modal

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("vistral_service")

MODEL_NAME = "Viet-Mistral/Vistral-7B-Chat"
INPUT_CHAR_LIMIT = 6000  # ~1500 tokens — safe for 32k context with prompt+output room

# ---------------------------------------------------------------------------
# Modal image: install deps + bake model weights at build time
# ---------------------------------------------------------------------------

def download_model():
    """Download model weights into the image at build time."""
    import os
    from huggingface_hub import snapshot_download

    token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")
    snapshot_download(MODEL_NAME, token=token)

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
        "huggingface_hub",
        "fastapi[standard]",
    )
    .run_commands(
        "pip install flash-attn --no-build-isolation",
        gpu="A10G",
    )
    .run_function(download_model, secrets=[modal.Secret.from_name("huggingface-secret")])
)

app = modal.App("vistral-summarizer", image=image)

# ---------------------------------------------------------------------------
# Prompt + helpers
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = (
    "Bạn là một trợ lý AI chuyên tóm tắt tin tức tiếng Việt. "
    "Hãy tóm tắt chính xác, ngắn gọn, không thêm thông tin không có trong bài gốc."
)

def estimate_reading_time(text: str) -> int:
    """Estimate reading time in minutes (~200 Vietnamese words/min)."""
    word_count = len(text.split())
    return max(1, math.ceil(word_count / 200))


# ---------------------------------------------------------------------------
# Modal class: loads model once per container, serves requests
# ---------------------------------------------------------------------------

@app.cls(gpu="A10G", scaledown_window=120)
class VistralModel:
    @modal.enter()
    def load(self):
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        logger.info(f"Loading {MODEL_NAME} onto GPU...")
        self.tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
        self.model = AutoModelForCausalLM.from_pretrained(
            MODEL_NAME,
            torch_dtype=torch.bfloat16,
            device_map="auto",
        )
        logger.info(f"{MODEL_NAME} loaded successfully.")

    @modal.fastapi_endpoint(method="POST")
    async def summarize(self, request: dict):
        import torch

        article_text = request.get("article_text", "")
        if not article_text or not article_text.strip():
            return {"error": "Empty input"}

        truncated = article_text[:INPUT_CHAR_LIMIT]
        conversation = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Hãy tóm tắt ngắn gọn bài báo sau trong 2-3 đoạn văn:\n\n{truncated}"},
        ]
        input_ids = self.tokenizer.apply_chat_template(
            conversation, return_tensors="pt", add_generation_prompt=True
        ).to("cuda")

        with torch.no_grad():
            outputs = self.model.generate(
                input_ids,
                max_new_tokens=512,
                do_sample=True,
                temperature=0.1,
                top_k=40,
                top_p=0.95,
                repetition_penalty=1.05,
                eos_token_id=self.tokenizer.eos_token_id,
                pad_token_id=self.tokenizer.pad_token_id,
            )

        generated = outputs[0][input_ids.shape[1]:]
        raw_output = self.tokenizer.decode(generated, skip_special_tokens=True)

        logger.info(f"Generated {len(raw_output)} chars")

        summary = raw_output.strip()
        if not summary:
            summary = "Không thể tóm tắt."

        return {
            "summary": summary,
            "category": "Khác",
            "readingTime": estimate_reading_time(article_text),
        }

    @modal.fastapi_endpoint(method="GET")
    async def health(self):
        return {
            "status": "ok",
            "model": MODEL_NAME,
            "gpu": "A10G",
        }
