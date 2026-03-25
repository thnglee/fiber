# Fiber

A browser extension + full-stack backend that automatically **summarizes** and **fact-checks** Vietnamese news articles using AI. Built as a university thesis project.

Fiber injects a sidebar into supported Vietnamese news sites, generates LLM-powered summaries with category tags and reading time estimates, and lets users highlight any text for search-augmented fact-checking — all scored with lexical and semantic evaluation metrics.

## Features

- **Auto-summarization** — Sidebar injected into news pages with LLM-generated summaries, category tags, and estimated reading time
- **Token streaming** — Summaries stream token-by-token for faster perceived response
- **Fact-checking** — Select any text on the page to trigger a search-augmented fact-check with scoring and reasoning
- **Intelligent routing** — Automatically routes articles to the optimal model based on text complexity, with a full fallback chain
- **Output fusion** — Evaluation mode runs multiple models in parallel and selects the best summary via BERTScore
- **Multi-provider LLM support** — Switch between OpenAI, Google Gemini, Anthropic Claude, and HuggingFace models from a settings UI, with per-model parameter tuning
- **Evaluation metrics** — Every summarization is automatically scored (ROUGE-1/2/L, BLEU, BERTScore F1, compression rate, latency) and persisted to Supabase
- **Cost tracking** — Token usage and estimated API cost tracked per request across all providers
- **Metrics dashboard** — `/metrics` page to browse, filter, and compare evaluation results across models
- **Settings page** — `/settings` page to select active model, tune parameters, and configure routing behavior
- **Live debug feed** — `/live` page streaming backend log events in real time
- **Action tracking** — `/dashboard` recording all extension actions with source URLs and model used

## Repository Structure

```
├── extension/          # Plasmo browser extension (React + TypeScript + Tailwind CSS)
│   ├── components/     # UI components, modals, icons
│   ├── contents/       # Content scripts injected into news pages
│   ├── background.ts   # Service worker
│   └── popup.tsx       # Extension popup
├── backend/            # Next.js 14 (App Router) API server + admin pages
│   ├── app/
│   │   ├── api/        # API routes (summarize, fact-check, metrics, settings, routing, dashboard, logs)
│   │   ├── debug/      # Debug testing page
│   │   ├── metrics/    # Evaluation metrics dashboard
│   │   ├── settings/   # Model configuration + routing settings UI
│   │   └── dashboard/  # Action tracking page
│   ├── services/       # Business logic layer
│   ├── domain/         # Types and Zod schemas
│   ├── config/         # Environment and app configuration
│   └── supabase/       # Database migrations (001–017)
├── bert/               # BERTScore microservice (FastAPI + Python + PhoBERT)
├── shared/             # Shared TypeScript types
├── metrics_reports/    # Evaluation datasets and results (5 topic categories)
└── docs/               # Documentation
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Browser extension | [Plasmo](https://www.plasmo.com/), React 18, TypeScript, Tailwind CSS |
| Backend API | Next.js 14 (App Router), TypeScript, Zod |
| Database | Supabase (PostgreSQL) |
| LLM providers | OpenAI, Google Gemini, Anthropic Claude, HuggingFace Inference |
| Search | Tavily |
| Content extraction | `@mozilla/readability` + JSDOM |
| Lexical metrics | Custom ROUGE implementation, `bleu-score` |
| Semantic metrics | BERTScore microservice (FastAPI + `vinai/phobert-base`) |

### Supported Models

| Provider | Models | Type |
|----------|--------|------|
| OpenAI | GPT-4o Mini, GPT-4o, GPT-4.1 Mini, GPT-4.1, o4 Mini, o3 Mini | Standard + Reasoning |
| Google Gemini | Gemini 2.0 Flash Lite, 2.0 Flash, 2.5 Flash, 2.5 Pro | Standard |
| Anthropic | Claude Haiku 4.5, Sonnet 4.5, Sonnet 4.6, Opus 4.6 | Standard |
| HuggingFace | ViT5-large (Vietnamese news summarization) | Base |

> **Note:** Vistral-7B-Chat (`Viet-Mistral/Vistral-7B-Chat`) is registered as a routing candidate and deployed via Modal serverless GPU. Set `VISTRAL_SERVICE_URL` in backend/.env to enable it. The fallback chain routes medium-complexity articles to GPT-4o when unavailable.

Reasoning models (o4-mini, o3-mini) automatically skip unsupported parameters like temperature and penalties. Missing API keys return clear error messages instead of crashing.

## Architecture

```
Browser Extension (Plasmo)
  │  content script injects summary sidebar & fact-check UI
  │
  ▼
Backend (Next.js API)
  ├── /api/summarize        LLM summarization (streaming or batch)
  │     │
  │     ├── routing_mode: auto       → complexity-based model selection
  │     ├── routing_mode: evaluation → run all models, pick best by BERTScore
  │     └── routing_mode: forced     → use specified model directly
  │
  ├── /api/fact-check       search-augmented fact verification
  ├── /api/settings         model configuration CRUD
  ├── /api/settings/routing routing mode + complexity thresholds config
  ├── /api/routing          routing analytics (model distribution, fallback rates)
  ├── /api/metrics          evaluation data with filtering
  ├── /api/dashboard        action tracking
  ├── /api/evaluate         trigger metrics computation
  └── /api/logs/stream      SSE debug feed
        │
        ▼
  services/
  ├── routing.service.ts    complexity classifier + model selector + fallback chain
  ├── fusion.service.ts     parallel model execution + BERTScore-based winner selection
  ├── llm.service.ts        provider dispatch (OpenAI / Gemini / Anthropic / HuggingFace)
  ├── summarize.service.ts  orchestrates summarization flow
  ├── fact-check.service.ts search → LLM pipeline
  └── bert.service.ts       calls BERTScore microservice
        │
        ▼
  Supabase
    ├── model_configurations    models with capability metadata + cost info
    ├── evaluation_metrics      ROUGE, BLEU, BERTScore, cost, latency per run
    ├── routing_decisions       complexity classification + model selection log
    ├── model_comparison_results  evaluation mode side-by-side results
    ├── app_settings            routing mode + threshold configuration
    └── dashboard_actions       extension user action log

BERTScore Microservice (FastAPI)
  └── POST /calculate-score    vinai/phobert-base for Vietnamese semantic similarity
```

### Routing Mechanism

The routing system automatically selects the best model based on article complexity:

| Complexity | Token Threshold | Preferred Model | Fallback Chain |
|-----------|----------------|-----------------|----------------|
| Short | ≤ 400 tokens | ViT5 | → Vistral → GPT-4o |
| Medium | ≤ 1500 tokens | Vistral | → GPT-4o |
| Long | > 1500 tokens | GPT-4o | — |

Three routing modes are available:
- **auto** — Complexity-based model selection with automatic fallback (default for normal usage)
- **evaluation** — Runs all candidate models in parallel, scores each summary with BERTScore, and returns the highest-scoring result (for thesis experiments)
- **forced** — Uses whatever model is specified or currently active (for manual testing)

## Supported News Sites

- [VnExpress](https://vnexpress.net)
- [Tuoi Tre](https://tuoitre.vn)
- [Dan Tri](https://dantri.com.vn)
- [Thanh Nien](https://thanhnien.vn)

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Python 3.10+ (only for the BERTScore microservice)
- A Supabase project with migrations applied (`backend/supabase/migrations/`)
- API keys: at minimum OpenAI + Tavily + Supabase; optionally Gemini, Anthropic, and HuggingFace

### 1. Backend

```bash
cd backend
npm install
```

Create `backend/.env`:

```env
# Required
OPENAI_API_KEY=
TAVILY_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Optional — additional LLM providers
GEMINI_API_KEY=
ANTHROPIC_API_KEY=
HF_API_KEY=              # HuggingFace token for ViT5/Vistral routing

# Optional — defaults
OPENAI_MODEL=gpt-4o-mini
OPENAI_TEMPERATURE=0.7
BERT_SERVICE_URL=          # URL of BERTScore microservice
```

```bash
npm run dev
# → http://localhost:3000
```

### 2. Extension

```bash
cd extension
npm install
```

Optionally create `extension/.env`:

```env
PLASMO_PUBLIC_API_URL=http://localhost:3000/api
```

```bash
npm run dev
# Plasmo opens a browser with the extension loaded and hot reload enabled
```

### 3. BERTScore Microservice (optional)

```bash
cd bert
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 7860
# → http://localhost:7860
```

Set `BERT_SERVICE_URL=http://localhost:7860` in `backend/.env`. Also deployable to [Hugging Face Spaces](https://huggingface.co/spaces) using the included `Dockerfile`.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/summarize` | Summarize an article. Body: `{ url?, content?, stream?, model?, routing_mode? }` |
| `POST` | `/api/fact-check` | Fact-check selected text. Body: `{ text, model? }` |
| `GET` | `/api/settings` | Get active model + all available model configs |
| `PATCH` | `/api/settings/active` | Switch active model. Body: `{ model }` |
| `PATCH` | `/api/settings/config` | Update model parameters. Body: `{ model, temperature?, ... }` |
| `GET/PUT` | `/api/settings/routing` | Get or update routing config (mode, thresholds) |
| `GET` | `/api/routing` | Routing analytics: model distribution, fallback rates, avg BERTScore |
| `GET` | `/api/metrics` | Fetch paginated evaluation metrics (filterable by mode, model) |
| `GET` | `/api/dashboard` | Fetch recent extension actions |
| `GET` | `/api/logs/stream` | SSE debug log stream |

All request/response shapes are validated with Zod schemas defined in `backend/domain/schemas.ts`.

## Evaluation Metrics

Each summarization stores the following in the `evaluation_metrics` table:

| Metric | Description |
|--------|-------------|
| `rouge_1` / `rouge_2` / `rouge_l` | Lexical overlap (unigram, bigram, LCS) |
| `bleu` | 4-gram BLEU precision |
| `bert_score` | Semantic similarity F1 via PhoBERT microservice |
| `compression_rate` | Summary length / original length |
| `latency` | Time to first token (streaming) or total time (batch) in ms |
| `model` | LLM model used (e.g., `gpt-4o-mini`, `gemini-2.5-flash`, `VietAI/vit5-large-vietnews-summarization`) |
| `prompt_tokens` / `completion_tokens` | Token usage |
| `estimated_cost_usd` | Computed from token counts and per-model pricing |
| `mode` | `"streaming"` or `"batch"` |
| `routing_id` | Links to the routing decision that selected this model |

Evaluation datasets cover 5 Vietnamese news categories: thoi_su (current affairs), phap_luat (law), kinh_te (economics), giao_duc (education), van_hoa (culture).

## Security Notes

- API keys live only in the backend `.env`. The extension calls the backend — it never holds secrets.
- Supabase service role key is used server-side only via `getSupabaseAdmin()`.
- The backend currently ships with permissive CORS for development. Lock this down before any public deployment.

## License

MIT
