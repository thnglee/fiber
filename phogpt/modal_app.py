import math
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
    """Download model weights AND custom code into the image at build time."""
    from huggingface_hub import snapshot_download
    from transformers import AutoConfig, AutoTokenizer

    snapshot_download(MODEL_NAME)
    AutoConfig.from_pretrained(MODEL_NAME, trust_remote_code=True)
    AutoTokenizer.from_pretrained(MODEL_NAME, trust_remote_code=True)

image = (
    modal.Image.from_registry("nvidia/cuda:12.1.0-devel-ubuntu22.04", add_python="3.11")
    .apt_install("git")
    .run_commands("pip install --upgrade pip setuptools wheel packaging ninja")
    .run_commands(
        "pip install torch --index-url https://download.pytorch.org/whl/cu121"
    )
    .pip_install(
        "transformers==4.38.2",
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
    .run_commands(
        "mkdir -p /usr/local/lib/python3.11/site-packages/triton_pre_mlir"
        " && touch /usr/local/lib/python3.11/site-packages/triton_pre_mlir/__init__.py"
    )
    .run_function(download_model)
)

app = modal.App("phogpt-summarizer", image=image)

# ---------------------------------------------------------------------------
# Prompt + helpers
# ---------------------------------------------------------------------------

def estimate_reading_time(text: str) -> int:
    """Estimate reading time in minutes (~200 Vietnamese words/min)."""
    word_count = len(text.split())
    return max(1, math.ceil(word_count / 200))


def build_prompt(content: str) -> str:
    truncated = content[:INPUT_CHAR_LIMIT]
    return f"""### Câu hỏi: Hãy tóm tắt ngắn gọn bài báo sau bằng tiếng Việt trong 2-3 đoạn văn:

{truncated}

### Trả lời:"""



# ---------------------------------------------------------------------------
# Modal class: loads model once per container, serves requests
# ---------------------------------------------------------------------------

@app.cls(gpu="T4", scaledown_window=120)
class PhoGPTModel:
    @modal.enter()
    def load(self):
        import torch
        from transformers import AutoConfig, AutoModelForCausalLM, AutoTokenizer

        logger.info(f"Loading {MODEL_NAME} onto GPU...")
        self.tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, trust_remote_code=True)

        # Official VinAI loading: use config.init_device instead of device_map
        config = AutoConfig.from_pretrained(MODEL_NAME, trust_remote_code=True)
        config.init_device = "cuda"
        self.model = AutoModelForCausalLM.from_pretrained(
            MODEL_NAME,
            config=config,
            trust_remote_code=True,
            torch_dtype=torch.bfloat16,
        )
        logger.info(f"{MODEL_NAME} loaded successfully.")

    @modal.fastapi_endpoint(method="POST")
    async def summarize(self, request: dict):
        import torch

        article_text = request.get("article_text", "")
        if not article_text or not article_text.strip():
            return {"error": "Empty input"}

        prompt = build_prompt(article_text)
        input_ids = self.tokenizer(prompt, return_tensors="pt")

        with torch.no_grad():
            outputs = self.model.generate(
                inputs=input_ids["input_ids"].to("cuda"),
                attention_mask=input_ids["attention_mask"].to("cuda"),
                max_new_tokens=1024,
                do_sample=True,
                temperature=1.0,
                top_k=50,
                top_p=0.9,
                repetition_penalty=1.1,
                eos_token_id=self.tokenizer.eos_token_id,
                pad_token_id=self.tokenizer.pad_token_id,
            )

        generated = outputs[0][input_ids["input_ids"].shape[1]:]
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
            "gpu": "T4",
        }
