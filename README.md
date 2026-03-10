# Fiber

A browser extension + full-stack backend that automatically **summarizes** and **fact-checks** Vietnamese news articles using AI. Built as a university thesis project.

Fiber injects a sidebar into supported Vietnamese news sites, generates LLM-powered summaries with category tags and reading time estimates, and lets users highlight any text for search-augmented fact-checking — all scored with lexical and semantic evaluation metrics.

## Features

- **Auto-summarization** — Sidebar injected into news pages with LLM-generated summaries, category tags, and estimated reading time
- **Token streaming** — Summaries stream token-by-token for faster perceived response
- **Fact-checking** — Select any text on the page to trigger a search-augmented fact-check with scoring and reasoning
- **Multi-provider LLM support** — Switch between OpenAI, Google Gemini, and Anthropic Claude models from a settings UI, with per-model parameter tuning
- **Evaluation metrics** — Every summarization is automatically scored (ROUGE-1/2/L, BLEU, BERTScore F1, compression rate, latency) and persisted to Supabase
- **Cost tracking** — Token usage and estimated API cost tracked per request across all providers
- **Metrics dashboard** — `/metrics` page to browse, filter, and compare evaluation results across models
- **Settings page** — `/settings` page to select active model, tune parameters (temperature, top-p, top-k, penalties, seed), and view model capabilities
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
│   │   ├── api/        # API routes (summarize, fact-check, metrics, settings, dashboard, logs)
│   │   ├── debug/      # Debug testing page
│   │   ├── metrics/    # Evaluation metrics dashboard
│   │   ├── settings/   # Model configuration UI
│   │   └── dashboard/  # Action tracking page
│   ├── services/       # Business logic layer
│   ├── domain/         # Types and Zod schemas
│   ├── config/         # Environment and app configuration
│   └── supabase/       # Database migrations (001–012)
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
| LLM providers | OpenAI, Google Gemini, Anthropic Claude |
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

Reasoning models (o4-mini, o3-mini) automatically skip unsupported parameters like temperature and penalties. Missing API keys return clear error messages instead of crashing.

## Architecture

```
Browser Extension (Plasmo)
  │  content script injects summary sidebar & fact-check UI
  │
  ▼
Backend (Next.js API)
  ├── /api/summarize        LLM summarization (streaming or batch)
  ├── /api/fact-check       search-augmented fact verification
  ├── /api/settings         model configuration CRUD
  ├── /api/metrics          evaluation data with filtering
  ├── /api/dashboard        action tracking
  ├── /api/evaluate         trigger metrics computation
  └── /api/logs/stream      SSE debug feed
        │
        ▼
  services/llm.service.ts   ← provider dispatch (OpenAI / Gemini / Anthropic)
        │                      based on active model from Supabase
        ├── openai SDK
        ├── @google/generative-ai SDK
        └── @anthropic-ai/sdk
        │
        ▼
  Supabase
    ├── model_configurations    14 models with capability metadata
    ├── evaluation_metrics      ROUGE, BLEU, BERTScore, cost, latency per run
    └── dashboard_actions       Extension user action log

BERTScore Microservice (FastAPI)
  └── POST /calculate-score    vinai/phobert-base for Vietnamese semantic similarity
```

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
- API keys: at minimum OpenAI + Tavily + Supabase; optionally Gemini and Anthropic

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
| `POST` | `/api/summarize` | Summarize an article. Body: `{ url?, content?, stream?, model? }` |
| `POST` | `/api/fact-check` | Fact-check selected text. Body: `{ text, model? }` |
| `GET` | `/api/settings` | Get active model + all available model configs |
| `PATCH` | `/api/settings/active` | Switch active model. Body: `{ model }` |
| `PATCH` | `/api/settings/config` | Update model parameters. Body: `{ model, temperature?, ... }` |
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
| `model` | LLM model used (e.g., `gpt-4o-mini`, `gemini-2.5-flash`) |
| `prompt_tokens` / `completion_tokens` | Token usage |
| `estimated_cost_usd` | Computed from token counts and per-model pricing |
| `mode` | `"streaming"` or `"batch"` |

Evaluation datasets cover 5 Vietnamese news categories: thoi_su (current affairs), phap_luat (law), kinh_te (economics), giao_duc (education), van_hoa (culture).

## Security Notes

- API keys live only in the backend `.env`. The extension calls the backend — it never holds secrets.
- Supabase service role key is used server-side only via `getSupabaseAdmin()`.
- The backend currently ships with permissive CORS for development. Lock this down before any public deployment.

## License

MIT
