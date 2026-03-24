# PhoGPT Modal Deployment — Design Spec

## Problem

PhoGPT-4B-Chat (`vinai/PhoGPT-4B-Chat`) is needed as the third model in evaluation mode (alongside ViT5 and GPT-4o). The existing Gradio/ZeroGPU deployment is blocked because HuggingFace ZeroGPU requires a Pro subscription ($9/mo). We need a free/cheap alternative.

## Decision

Deploy PhoGPT on **Modal.com** as a serverless GPU function with a web endpoint.

- **Why Modal**: $30/mo free credits, pay-per-second GPU billing, zero cost when idle, simple Python deployment.
- **Why not alternatives**: HF ZeroGPU requires subscription; Replicate/RunPod have no free tier; Colab isn't persistent; GGUF/CPU is too slow (~60s per article).

## Architecture

```
Evaluation Mode (browser extension)
  → backend /api/summarize (evaluation mode)
    → fusion.service.ts runs 3 models in parallel:
        1. ViT5 (HuggingFace Inference API)
        2. PhoGPT (Modal web endpoint)  ← NEW
        3. GPT-4o (OpenAI API)
    → BERTScore comparison → best result returned
```

## New File: `phogpt/modal_app.py`

A Modal app that:

1. **Builds an image** with `torch`, `transformers`, `accelerate` pre-installed
2. **Bakes model weights** into the image at build time via `image.run_function(download_model)` — eliminates download on cold start
3. **Exposes `POST /summarize`** as a `@modal.fastapi_endpoint` on a T4 GPU
4. **Reuses existing logic** — same prompt (`build_prompt`), same parsing (`parse_response`), same generation params

### Endpoint Contract

```
POST https://<workspace>--phogpt-summarizer-summarize.modal.run
Content-Type: application/json

Request:  { "article_text": "string" }
Response: { "summary": "string", "category": "string", "readingTime": number }
Error:    { "error": "string" }
```

### Key Differences from Gradio Version

| Aspect | Gradio (old) | Modal (new) |
|--------|-------------|-------------|
| Decorator | `@spaces.GPU` | `@app.function(gpu="T4")` |
| Endpoint | Gradio `/call/summarize` + SSE polling | Direct POST `/summarize` |
| Model loading | Lazy on first GPU call | Baked into image + loaded in `@modal.enter` |
| Hosting | HF Spaces (needs Pro) | Modal (free $30/mo) |
| Cold start | ~30s | ~30-60s (acceptable for evaluation) |

### GPU Choice

**T4** (16GB VRAM, $0.000164/sec = ~$0.59/hr):
- PhoGPT-4B in float16 = ~8GB VRAM — fits comfortably on T4's 16GB
- Cheapest GPU option on Modal
- A typical evaluation batch of 50 articles ≈ 25 min GPU time ≈ $0.25

## Backend Changes: `callPhoGPTService()` in `summarize.service.ts`

Simplify from Gradio's two-step SSE pattern to a single POST:

```typescript
// OLD (Gradio): POST /call/summarize → get event_id → GET /call/summarize/{event_id} → parse SSE
// NEW (Modal):  POST /summarize → get JSON directly

async function callPhoGPTService(articleText: string): Promise<SummaryData> {
  const serviceUrl = getEnvVar("PHOGPT_SERVICE_URL")  // Modal endpoint URL
  const truncated = articleText.substring(0, PHOGPT_INPUT_CHAR_LIMIT)

  const res = await fetch(serviceUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ article_text: truncated }),
    signal: AbortSignal.timeout(timeoutMs),
  })

  const data = await res.json()
  return { summary: data.summary, category: data.category, readingTime: data.readingTime }
}
```

No changes needed to `routing.service.ts`, `fusion.service.ts`, or `evaluation.service.ts` — they all just check `PHOGPT_SERVICE_URL` env var.

## Environment Variable

```bash
# .env (backend)
PHOGPT_SERVICE_URL=https://<workspace>--phogpt-summarizer-summarize.modal.run
```

## Deployment Steps (User)

1. Sign up at modal.com (GitHub OAuth, no credit card needed)
2. `pip install modal` and `modal token new` to authenticate
3. `modal deploy phogpt/modal_app.py` — get the endpoint URL
4. Set `PHOGPT_SERVICE_URL` in backend `.env`

## Cost Estimate

| Scenario | GPU time | Cost |
|----------|----------|------|
| Single article | ~30s | ~$0.005 |
| 50-article evaluation batch | ~25 min | ~$0.25 |
| Idle (no requests) | 0 | $0.00 |
| Monthly free credits | — | $30.00 |

## Files Changed

| File | Action |
|------|--------|
| `phogpt/modal_app.py` | **Create** — Modal deployment replacing `app.py` |
| `phogpt/requirements.txt` | **Delete** — Modal handles deps in image definition |
| `phogpt/README.md` | **Update** — Modal deployment instructions |
| `backend/services/summarize.service.ts` | **Edit** — simplify `callPhoGPTService()` to single POST |
| `backend/.env.example` | **Edit** — add `PHOGPT_SERVICE_URL` example |

## Out of Scope

- Streaming support (PhoGPT already has `supports_streaming: false`)
- Authentication on the Modal endpoint (evaluation-only, low traffic)
- Keep-alive / warm containers (cold start acceptable for evaluation)
