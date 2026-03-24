# PhoGPT-4B-Chat Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy PhoGPT-4B-Chat as a Gradio microservice on HuggingFace Spaces (ZeroGPU) and integrate it with the backend so the routing mechanism can use PhoGPT for medium-complexity articles instead of falling back to GPT-4o.

**Architecture:** A new `phogpt/` directory contains a Gradio app that loads `vinai/PhoGPT-4B-Chat` on ZeroGPU and exposes a `/summarize` API endpoint. The backend's `llm.service.ts` gains a `callPhoGPTService()` function that calls this dedicated service (bypassing the HF Inference API). The routing service's `isModelAvailable()` is updated to check `PHOGPT_SERVICE_URL` for PhoGPT availability. The microservice builds its own prompt (using PhoGPT's `### Câu hỏi: / ### Trả lời:` chat format) and returns JSON matching `SummaryDataSchema`.

**Tech Stack:** Python, Gradio, `transformers`, ZeroGPU (`@spaces.GPU`), HuggingFace Spaces

**Key design decisions:**
- The microservice receives **raw article text** (not the backend's formatted prompt) and builds its own PhoGPT-specific prompt using the `### Câu hỏi: / ### Trả lời:` format that PhoGPT was trained on.
- The prompt content (categories, instructions) matches `backend/config/prompts.ts` exactly, but wrapped in PhoGPT's chat template.
- `callPhoGPTService()` is called from `summarize.service.ts` (not from `generateCompletion`), since PhoGPT bypasses the standard LLM pipeline entirely — it doesn't need prompt construction, schema validation, or provider switching.
- PhoGPT has `supports_streaming: false` in the DB already (migration 016), so streaming requests won't reach it.

---

## File Structure

| Action | File | Purpose |
|--------|------|---------|
| Create | `phogpt/app.py` | Gradio app — loads PhoGPT, exposes summarize API |
| Create | `phogpt/requirements.txt` | Python dependencies |
| Create | `phogpt/README.md` | HF Spaces metadata (title, sdk, emoji) |
| Modify | `backend/domain/schemas.ts:164-206` | Add `PHOGPT_SERVICE_URL` to `EnvSchema` |
| Modify | `backend/config/env.ts:20-41` | Pass `PHOGPT_SERVICE_URL` through to env validation |
| Modify | `backend/services/routing.service.ts:91-101` | Update `isModelAvailable()` to check `PHOGPT_SERVICE_URL` for PhoGPT |
| Modify | `backend/services/summarize.service.ts:26` | Add PhoGPT-specific call path in `performSummarize()` |
| Modify | `README.md` | Remove the "PhoGPT not deployed" caveat |

---

### Task 1: Create the PhoGPT Gradio Microservice

**Files:**
- Create: `phogpt/app.py`
- Create: `phogpt/requirements.txt`
- Create: `phogpt/README.md`

- [ ] **Step 1: Create `phogpt/requirements.txt`**

```
gradio[oauth]>=4.0.0
transformers>=4.36.0
torch>=2.6.0
accelerate>=0.25.0
```

- [ ] **Step 2: Create `phogpt/README.md`** (HF Spaces metadata)

```markdown
---
title: PhoGPT Summarizer
emoji: 📰
colorFrom: blue
colorTo: green
sdk: gradio
sdk_version: "5.23.3"
app_file: app.py
pinned: false
---
```

- [ ] **Step 3: Create `phogpt/app.py`**

The app:
1. Uses `@spaces.GPU` for ZeroGPU
2. Loads `vinai/PhoGPT-4B-Chat` via `transformers`
3. Accepts **raw article text** — builds prompt internally using PhoGPT's chat format
4. Prompt content matches `backend/config/prompts.ts` (same categories, same instructions)
5. Returns JSON string `{ summary, category, readingTime }`
6. Truncates input to 6000 chars (~1500 tokens) to stay within 8192 context

```python
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


# Health 
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
```

- [ ] **Step 4: Commit**

```bash
git add phogpt/
git commit -m "feat: add PhoGPT-4B-Chat Gradio microservice for ZeroGPU deployment"
```

---

### Task 2: Add `PHOGPT_SERVICE_URL` to Backend Environment

**Files:**
- Modify: `backend/domain/schemas.ts:164-206` (EnvSchema)
- Modify: `backend/config/env.ts:20-41` (pass through)

- [ ] **Step 1: Add `PHOGPT_SERVICE_URL` to `EnvSchema`**

In `backend/domain/schemas.ts`, add after `HF_TIMEOUT_MS` line (line 173):

```typescript
  PHOGPT_SERVICE_URL: z.string().url().optional(),
```

- [ ] **Step 2: Add to `getEnv()` in `backend/config/env.ts`**

In `backend/config/env.ts`, add to the `EnvSchema.parse()` call, after the `HF_TIMEOUT_MS` line (around line 27):

```typescript
      PHOGPT_SERVICE_URL: process.env.PHOGPT_SERVICE_URL,
```

- [ ] **Step 3: Commit**

```bash
git add backend/domain/schemas.ts backend/config/env.ts
git commit -m "feat: add PHOGPT_SERVICE_URL env var"
```

---

### Task 3: Update Routing Service — PhoGPT Availability Check

**Files:**
- Modify: `backend/services/routing.service.ts:91-101`

The `isModelAvailable()` function currently checks `availableProviders.has('huggingface')` for PhoGPT, which requires `HF_API_KEY`. Since PhoGPT uses a dedicated microservice via `PHOGPT_SERVICE_URL`, we need to check for that instead.

- [ ] **Step 1: Update `isModelAvailable()` to check `PHOGPT_SERVICE_URL` for PhoGPT**

In `backend/services/routing.service.ts`, change the HuggingFace model check (line 95):

Before:
```typescript
  if (modelName === MODEL_VIT5 || modelName === MODEL_PHOGPT) return availableProviders.has('huggingface')
```

After:
```typescript
  // ViT5 uses HF Inference API
  if (modelName === MODEL_VIT5) return availableProviders.has('huggingface')
  // PhoGPT uses a dedicated Gradio microservice
  if (modelName === MODEL_PHOGPT) return !!getEnvVar('PHOGPT_SERVICE_URL')
```

- [ ] **Step 2: Commit**

```bash
git add backend/services/routing.service.ts
git commit -m "fix: check PHOGPT_SERVICE_URL for PhoGPT availability in routing"
```

---

### Task 4: Integrate PhoGPT Service into Summarize Service

**Files:**
- Modify: `backend/services/summarize.service.ts`

PhoGPT bypasses the standard `generateJsonCompletion()` pipeline entirely — it doesn't need the backend's prompt construction, provider switching, or schema-based structured output. Instead, `performSummarize()` calls the PhoGPT microservice directly when the model is PhoGPT, sending raw article text and receiving parsed JSON.

- [ ] **Step 1: Add `callPhoGPTService()` helper in `summarize.service.ts`**

Add at the top of the file, after the imports:

```typescript
import { getEnvVar } from "@/config/env"

const PHOGPT_MODEL_NAME = 'vinai/PhoGPT-4B-Chat'
const PHOGPT_INPUT_CHAR_LIMIT = 6000

/**
 * Call the dedicated PhoGPT Gradio microservice.
 * The microservice builds its own prompt and returns JSON { summary, category, readingTime }.
 */
async function callPhoGPTService(articleText: string): Promise<SummaryData> {
  const serviceUrl = getEnvVar("PHOGPT_SERVICE_URL")
  if (!serviceUrl) throw new Error("PHOGPT_SERVICE_URL is not set")

  const timeoutMs = Number(getEnvVar("HF_TIMEOUT_MS")) || 120000

  const truncated = articleText.length > PHOGPT_INPUT_CHAR_LIMIT
    ? articleText.substring(0, PHOGPT_INPUT_CHAR_LIMIT)
    : articleText

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    // Gradio /call API: POST to initiate, then GET to stream result
    const initRes = await fetch(`${serviceUrl}/call/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [truncated] }),
      signal: controller.signal,
    })

    if (!initRes.ok) {
      const errText = await initRes.text()
      throw new Error(`PhoGPT service error ${initRes.status}: ${errText}`)
    }

    const { event_id } = await initRes.json()
    if (!event_id) {
      throw new Error('PhoGPT service returned no event_id')
    }

    // Stream result
    const resultRes = await fetch(`${serviceUrl}/call/summarize/${event_id}`, {
      signal: controller.signal,
    })

    if (!resultRes.ok) {
      const errText = await resultRes.text()
      throw new Error(`PhoGPT result error ${resultRes.status}: ${errText}`)
    }

    const resultText = await resultRes.text()

    // Gradio SSE format: "event: complete\ndata: [\"json_string\"]\n\n"
    const dataMatch = resultText.match(/^data:\s*(.+)$/m)
    if (!dataMatch) {
      throw new Error(`PhoGPT returned no data: ${resultText.substring(0, 200)}`)
    }

    const dataArray = JSON.parse(dataMatch[1])
    const rawJson = typeof dataArray[0] === 'string' ? dataArray[0] : JSON.stringify(dataArray[0])
    const parsed = JSON.parse(rawJson)

    return {
      summary: parsed.summary || '',
      category: parsed.category || 'Khác',
      readingTime: typeof parsed.readingTime === 'number' ? parsed.readingTime : 1,
    }
  } finally {
    clearTimeout(timeoutId)
  }
}
```

- [ ] **Step 2: Add PhoGPT branch in `performSummarize()`**

In `performSummarize()`, after the content extraction block and before the `getSummarizePrompt()` call (around line 92), add:

```typescript
  // PhoGPT uses a dedicated microservice — bypass the LLM pipeline
  if (modelConfig?.model_name === PHOGPT_MODEL_NAME) {
    const startTime = Date.now()
    const summaryData = await callPhoGPTService(extractedContent)
    const latency = Date.now() - startTime

    const response: SummarizeResponse = {
      summary: summaryData.summary,
      category: summaryData.category,
      readingTime: summaryData.readingTime,
      model: PHOGPT_MODEL_NAME,
      usage: undefined, // PhoGPT microservice doesn't return token counts
    }

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
            error: crErr instanceof Error ? crErr.message : String(crErr),
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
          error: err instanceof Error ? err.message : String(err),
        })
      }
    })()

    if (debug) {
      response.debug = debugInfo
    }

    return response
  }
```

- [ ] **Step 3: Verify the build compiles**

Run: `cd backend && npm run build`
Expected: No TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add backend/services/summarize.service.ts
git commit -m "feat: integrate PhoGPT dedicated service in summarize pipeline"
```

---

### Task 5: Update README and Clean Up

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Remove PhoGPT "not deployed" caveat from README.md**

Remove the blockquote note around line 69 that says PhoGPT is not yet deployed. Replace with a note about the Gradio/ZeroGPU deployment.

- [ ] **Step 2: Add `PHOGPT_SERVICE_URL` to env vars in README and CLAUDE.md**

Add to the environment variables sections:
```
PHOGPT_SERVICE_URL=     # URL of PhoGPT Gradio service on HF Spaces (optional)
```

- [ ] **Step 3: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: update README and CLAUDE.md for PhoGPT deployment"
```

---

### Task 6: Manual Steps (User)

These cannot be automated and must be done by the user:

- [ ] **Step 1: Create HuggingFace Space**

1. Go to https://huggingface.co/spaces
2. Create new Space: name = `phogpt-summarizer` (or similar)
3. Select **Gradio** SDK
4. Select **ZeroGPU** hardware (free tier)
5. Push the `phogpt/` directory contents to the Space repo

```bash
cd phogpt
git init
git remote add origin https://huggingface.co/spaces/<your-username>/phogpt-summarizer
git add .
git commit -m "Initial PhoGPT summarizer deployment"
git push -u origin main
```

- [ ] **Step 2: Wait for Space to build and test**

1. Wait for the Space to build (~5-10 minutes for first build, model download)
2. Test via the Gradio UI by pasting a Vietnamese news article
3. Verify JSON output has `summary`, `category`, `readingTime` fields

- [ ] **Step 3: Set `PHOGPT_SERVICE_URL` in backend `.env`**

```
PHOGPT_SERVICE_URL=https://<your-username>-phogpt-summarizer.hf.space
```

- [ ] **Step 4: Test end-to-end**

1. Start backend: `cd backend && npm run dev`
2. Test auto routing with a medium-length article (~500-1500 tokens)
3. Verify PhoGPT is selected (not falling back to GPT-4o)
4. Check debug logs for `routing` entries showing PhoGPT
