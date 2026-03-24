# PhoGPT Modal Deployment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy PhoGPT-4B-Chat on Modal.com as a serverless GPU web endpoint so it can serve as the third model in evaluation mode.

**Architecture:** A Modal Python app bakes the model weights into the container image at build time and exposes a single `POST /summarize` FastAPI endpoint on a T4 GPU. The backend's `callPhoGPTService()` is simplified from Gradio's two-step SSE polling to a single POST. The routing service's `isModelAvailable()` check is updated to look for `PHOGPT_SERVICE_URL` instead of the `huggingface` provider.

**Tech Stack:** Python, Modal SDK, PyTorch, Transformers, FastAPI (via Modal's web_endpoint), Next.js backend (TypeScript)

---

### Task 1: Create `phogpt/modal_app.py` — Modal deployment file

**Files:**
- Create: `phogpt/modal_app.py`

This is the core deployment file. It reuses the exact prompt, parsing, and generation logic from the existing `phogpt/app.py` (Gradio version on `feature/phogpt-deployment` branch), but replaces Gradio + `@spaces.GPU` with Modal's `@modal.web_endpoint` + `gpu="T4"`.

- [ ] **Step 1: Create `phogpt/modal_app.py`**

```python
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
    """Download model weights into the image at build time."""
    from transformers import AutoModelForCausalLM, AutoTokenizer
    AutoTokenizer.from_pretrained(MODEL_NAME, trust_remote_code=True)
    AutoModelForCausalLM.from_pretrained(MODEL_NAME, trust_remote_code=True)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("torch", "transformers", "accelerate")
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
```

- [ ] **Step 2: Verify syntax**

Run: `cd phogpt && python -c "import ast; ast.parse(open('modal_app.py').read()); print('Syntax OK')"`
Expected: `Syntax OK`

- [ ] **Step 3: Commit**

```bash
git add phogpt/modal_app.py
git commit -m "feat(phogpt): add Modal serverless GPU deployment"
```

---

### Task 2: Add `PHOGPT_SERVICE_URL` to backend env schema

**Files:**
- Modify: `backend/domain/schemas.ts:164-195` (EnvSchema)
- Modify: `backend/config/env.ts:20-41` (getEnv)

- [ ] **Step 1: Add `PHOGPT_SERVICE_URL` to `EnvSchema`**

In `backend/domain/schemas.ts`, add to the `EnvSchema` object after the `HF_TIMEOUT_MS` line:

```typescript
// PhoGPT Modal microservice URL (optional — only needed for evaluation mode)
PHOGPT_SERVICE_URL: z.string().url().optional(),
```

- [ ] **Step 2: Add `PHOGPT_SERVICE_URL` to `getEnv()` in `env.ts`**

In `backend/config/env.ts`, add to the `EnvSchema.parse({...})` object:

```typescript
PHOGPT_SERVICE_URL: process.env.PHOGPT_SERVICE_URL,
```

- [ ] **Step 3: Verify backend compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add backend/domain/schemas.ts backend/config/env.ts
git commit -m "feat(env): add PHOGPT_SERVICE_URL to environment schema"
```

---

### Task 3: Add `callPhoGPTService()` to `summarize.service.ts`

**Files:**
- Modify: `backend/services/summarize.service.ts`

This adds a new `callPhoGPTService()` function and a PhoGPT-specific code path in `performSummarize()`. Unlike the Gradio version (which used two-step SSE polling), the Modal version is a single POST that returns JSON directly.

- [ ] **Step 1: Add constants and `callPhoGPTService()` function**

Add after the existing imports (line 18) in `summarize.service.ts`:

```typescript
import { getEnvVar } from "@/config/env"

const PHOGPT_MODEL_NAME = 'vinai/PhoGPT-4B-Chat'
const PHOGPT_INPUT_CHAR_LIMIT = 6000

/**
 * Call the dedicated PhoGPT Modal microservice.
 * Single POST → JSON response (no Gradio SSE polling).
 */
async function callPhoGPTService(articleText: string): Promise<SummaryData> {
  const serviceUrl = getEnvVar("PHOGPT_SERVICE_URL")
  if (!serviceUrl) throw new Error("PHOGPT_SERVICE_URL is not set")

  const timeoutMs = Number(getEnvVar("HF_TIMEOUT_MS")) || 120000

  const truncated = articleText.length > PHOGPT_INPUT_CHAR_LIMIT
    ? articleText.substring(0, PHOGPT_INPUT_CHAR_LIMIT)
    : articleText

  const res = await fetch(serviceUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ article_text: truncated }),
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`PhoGPT service error ${res.status}: ${errText}`)
  }

  const data = await res.json()

  if (data.error) {
    throw new Error(`PhoGPT service returned error: ${data.error}`)
  }

  return {
    summary: data.summary || '',
    category: data.category || 'Khác',
    readingTime: typeof data.readingTime === 'number' ? data.readingTime : 1,
  }
}
```

- [ ] **Step 2: Add PhoGPT code path in `performSummarize()`**

In `performSummarize()`, after the content extraction block (after line 96 `debugInfo.prompt = prompt`) and before the LLM call (line 99), add a PhoGPT early-return branch:

```typescript
  // PhoGPT: bypass the standard LLM pipeline — call dedicated Modal microservice
  if (modelConfig?.model_name === PHOGPT_MODEL_NAME) {
    const startTime = Date.now()
    const summaryData = await callPhoGPTService(extractedContent)
    const latency = Date.now() - startTime

    const response: SummarizeResponse = {
      summary: summaryData.summary,
      category: summaryData.category,
      readingTime: summaryData.readingTime,
      model: PHOGPT_MODEL_NAME,
      usage: undefined,
    }

    logger.addLog('summarize', 'phogpt-complete', {
      latency,
      summaryLength: summaryData.summary.length,
    })

    // Fire-and-forget evaluation metrics
    void (async () => {
      try {
        const [metrics, bertScore] = await Promise.all([
          Promise.resolve(calculateLexicalMetrics(response.summary, extractedContent)),
          calculateBertScore(extractedContent, response.summary),
        ])

        let compressionRate: number | null = null
        try {
          const result = calculateCompressionRate({
            originalText: extractedContent,
            summaryText: response.summary,
          })
          compressionRate = result.compressionRate
        } catch (crErr) {
          logger.addLog('summarize', 'compression-rate-error', {
            error: crErr instanceof Error ? crErr.message : String(crErr)
          })
        }

        await saveEvaluationMetrics({
          summary: response.summary,
          original: extractedContent,
          url: typeof url === 'string' ? url : undefined,
          metrics: { ...metrics, bert_score: bertScore, compression_rate: compressionRate, total_tokens: null },
          latency,
          mode: 'sync',
          model: PHOGPT_MODEL_NAME,
        })
      } catch (err) {
        logger.addLog('summarize', 'evaluation-error', {
          error: err instanceof Error ? err.message : String(err)
        })
      }
    })()

    if (debug) {
      response.debug = debugInfo
    }

    return response
  }
```

- [ ] **Step 3: Verify backend compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add backend/services/summarize.service.ts
git commit -m "feat(summarize): add PhoGPT Modal microservice integration"
```

---

### Task 4: Update `routing.service.ts` — PhoGPT availability check

**Files:**
- Modify: `backend/services/routing.service.ts:91-102` (isModelAvailable function)

Currently PhoGPT's availability is tied to the `huggingface` provider (HF_API_KEY). It should instead check for `PHOGPT_SERVICE_URL`, since PhoGPT now runs on Modal, not through the HF Inference API.

- [ ] **Step 1: Add import and update `isModelAvailable()`**

Add import at the top of `routing.service.ts`:

```typescript
import { getEnvVar } from "@/config/env"
```

Note: `getEnvVar` is already imported (line 3). No new import needed.

Change line 95 from:

```typescript
if (modelName === MODEL_VIT5 || modelName === MODEL_PHOGPT) return availableProviders.has('huggingface')
```

To:

```typescript
if (modelName === MODEL_VIT5) return availableProviders.has('huggingface')
if (modelName === MODEL_PHOGPT) return !!getEnvVar('PHOGPT_SERVICE_URL')
```

- [ ] **Step 2: Verify backend compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add backend/services/routing.service.ts
git commit -m "feat(routing): check PHOGPT_SERVICE_URL for PhoGPT availability"
```

---

### Task 5: Update `phogpt/README.md` with Modal deployment instructions

**Files:**
- Create: `phogpt/README.md`

- [ ] **Step 1: Write README**

```markdown
# PhoGPT Summarizer — Modal Deployment

Vietnamese news summarizer using [vinai/PhoGPT-4B-Chat](https://huggingface.co/vinai/PhoGPT-4B-Chat) on Modal serverless GPU.

## Prerequisites

1. Sign up at [modal.com](https://modal.com) (GitHub OAuth, no credit card needed)
2. Install Modal CLI: `pip install modal`
3. Authenticate: `modal token new`

## Deploy

```bash
cd phogpt
modal deploy modal_app.py
```

After deployment, Modal prints the endpoint URL. Set it in `backend/.env`:

```
PHOGPT_SERVICE_URL=https://<your-workspace>--phogpt-summarizer-summarize.modal.run
```

## Test

```bash
curl -X POST https://<your-workspace>--phogpt-summarizer-summarize.modal.run \
  -H "Content-Type: application/json" \
  -d '{"article_text": "Thủ tướng Phạm Minh Chính vừa ký quyết định phê duyệt quy hoạch..."}'
```

## Cost

- T4 GPU: ~$0.59/hr, pay-per-second
- $30/mo free credits included
- $0 when idle (no requests)

## Health Check

```bash
curl https://<your-workspace>--phogpt-summarizer-health.modal.run
```
```

- [ ] **Step 2: Commit**

```bash
git add phogpt/README.md
git commit -m "docs(phogpt): add Modal deployment instructions"
```

---

### Task 6: Deploy and verify end-to-end

This task is manual — the developer deploys to Modal and tests the full pipeline.

- [ ] **Step 1: Deploy to Modal**

```bash
cd phogpt
modal deploy modal_app.py
```

Expected: Modal prints two endpoint URLs (summarize and health).

- [ ] **Step 2: Test health endpoint**

```bash
curl https://<workspace>--phogpt-summarizer-health.modal.run
```

Expected: `{"status":"ok","model":"vinai/PhoGPT-4B-Chat","gpu":"T4"}`

- [ ] **Step 3: Test summarize endpoint**

```bash
curl -X POST https://<workspace>--phogpt-summarizer-summarize.modal.run \
  -H "Content-Type: application/json" \
  -d '{"article_text": "Thủ tướng Phạm Minh Chính đã chủ trì phiên họp Chính phủ thường kỳ tháng 3 năm 2026. Tại phiên họp, Chính phủ đã thảo luận về tình hình kinh tế - xã hội, trong đó GDP quý I tăng 6.5% so với cùng kỳ năm trước."}'
```

Expected: JSON with `summary`, `category`, `readingTime` keys. First call may take 30-60s (cold start).

- [ ] **Step 4: Set env var and test backend**

Add to `backend/.env`:
```
PHOGPT_SERVICE_URL=https://<workspace>--phogpt-summarizer-summarize.modal.run
```

Then test evaluation mode from the extension or debug page — PhoGPT should now appear as one of the 3 models.

- [ ] **Step 5: Final commit (if any env or config adjustments were needed)**

```bash
git add -A
git commit -m "chore: finalize PhoGPT Modal deployment configuration"
```
