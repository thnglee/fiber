# Fiber

A browser extension + full-stack backend that automatically **summarizes** and **fact-checks** Vietnamese news articles using AI. Built as a university thesis project.

## Repository structure

```
.
├── extension/   # Plasmo browser extension (React + TypeScript + Tailwind CSS)
├── backend/     # Next.js (App Router) API backend
├── bert/        # BERTScore microservice (FastAPI + Python)
├── shared/      # Shared types/utilities
└── docs/        # Documentation and notes
```

## Features

- **Auto-summarization** — Injects a sidebar into supported news pages; fetches an LLM-generated summary with category tag and estimated reading time.
- **Streaming mode** — Summaries stream token-by-token for a faster perceived response.
- **Fact-checking** — Select any text on the page to trigger a search-augmented fact-check, scored and reasoned by the LLM.
- **Evaluation metrics** — Every summarization request is automatically scored with ROUGE-1/2/L, BLEU, BERTScore F1, compression rate, and latency, then persisted to Supabase.
- **Metrics dashboard** — Internal `/metrics` page to browse and compare evaluation results across all requests.
- **Live debug feed** — `/live` page that streams backend log events in real time.
- **Action tracking** — `/dashboard` records all extension actions (summarize, fact-check) with source URLs.

## Tech stack

| Layer              | Technology                                                            |
| ------------------ | --------------------------------------------------------------------- |
| Browser extension  | [Plasmo](https://www.plasmo.com/), React 18, TypeScript, Tailwind CSS |
| Backend API        | Next.js 14 (App Router), TypeScript, Zod                              |
| Database           | Supabase (Postgres)                                                   |
| LLM                | OpenAI (`gpt-4o-mini` by default)                                     |
| Search             | Tavily                                                                |
| Content extraction | `@mozilla/readability` + JSDOM                                        |
| Lexical metrics    | Custom ROUGE implementation, `bleu-score`                             |
| Semantic metrics   | BERTScore microservice (FastAPI + `bert-score`)                       |

## Architecture overview

```
Browser (Extension)
  │  content script injects summary sidebar & fact-check UI
  │
  ▼
Backend (Next.js API)
  ├── /api/summarize     ← LLM summarization (streaming or batch)
  ├── /api/fact-check    ← search-augmented fact-check
  ├── /api/metrics       ← evaluation data CRUD
  ├── /api/dashboard     ← action tracking
  └── /api/logs/stream   ← SSE debug feed
        │
        ├── services/llm.service.ts          structured LLM calls (Zod schemas)
        ├── services/summarize.service.ts    orchestrates summarization flow
        ├── services/fact-check.service.ts   search → LLM pipeline
        ├── services/evaluation.service.ts   ROUGE, BLEU, persists to Supabase
        ├── services/bert.service.ts         calls BERTScore microservice
        ├── services/content-extraction.service.ts  Readability + JSDOM
        ├── services/search.service.ts       Tavily wrapper
        ├── services/compression.service.ts  compression rate calculation
        └── services/action-tracking.service.ts
              │
              ▼
          Supabase (evaluation_metrics, dashboard_actions)

BERTScore Microservice (FastAPI — bert/)
  └── POST /calculate-score   ← called by bert.service.ts
```

## Supported news sites

The extension has host permissions for:

- `vnexpress.net`
- `tuoitre.vn`
- `dantri.com.vn`
- `thanhnien.vn`

## Getting started

### Prerequisites

- Node.js 18+ and npm (or pnpm)
- Python 3.10+ (only if running the BERT microservice locally)
- A Supabase project with the migrations applied (`backend/supabase/migrations/`)
- API keys: OpenAI, Tavily, Supabase

### 1. Backend

```bash
cd backend
npm install

# Create backend/.env with the following:
# OPENAI_API_KEY=...
# TAVILY_API_KEY=...
# NEXT_PUBLIC_SUPABASE_URL=...
# NEXT_PUBLIC_SUPABASE_ANON_KEY=...
# SUPABASE_SERVICE_ROLE_KEY=...
# BERT_SERVICE_URL=...          # URL of the deployed BERTScore microservice (optional)
# OPENAI_MODEL=gpt-4o-mini      # optional override
# OPENAI_TEMPERATURE=0.7        # optional override

npm run dev
# → http://localhost:3000
```

### 2. Extension

```bash
cd extension
npm install

# Optionally create extension/.env:
# PLASMO_PUBLIC_API_URL=http://localhost:3000/api

npm run dev
# Plasmo opens a browser with the extension loaded and hot reload enabled.
```

### 3. BERTScore microservice (optional, Python)

```bash
cd bert
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 7860
# → http://localhost:7860
# Set BERT_SERVICE_URL=http://localhost:7860 in backend/.env
```

The microservice is also deployable to [Hugging Face Spaces](https://huggingface.co/spaces) using the included `Dockerfile`.

## Key API endpoints

| Method | Endpoint           | Description                                            |
| ------ | ------------------ | ------------------------------------------------------ |
| `POST` | `/api/summarize`   | Summarize article. Body: `{ url?, content?, stream? }` |
| `POST` | `/api/fact-check`  | Fact-check selected text. Body: `{ text }`             |
| `GET`  | `/api/metrics`     | Fetch paginated evaluation metrics                     |
| `GET`  | `/api/dashboard`   | Fetch recent extension actions                         |
| `GET`  | `/api/logs/stream` | SSE debug log stream                                   |

All request/response shapes are validated with Zod schemas defined in `backend/domain/schemas.ts`.

## Evaluation metrics

Each summarization stores the following metrics in the `evaluation_metrics` Supabase table:

| Metric                            | Description                                                 |
| --------------------------------- | ----------------------------------------------------------- |
| `rouge_1` / `rouge_2` / `rouge_l` | Lexical overlap (unigram, bigram, LCS)                      |
| `bleu`                            | 4-gram BLEU precision                                       |
| `bert_score`                      | Semantic similarity F1 via the BERTScore microservice       |
| `compression_rate`                | Summary length / original length                            |
| `latency`                         | Time to first token (streaming) or total time (batch) in ms |
| `mode`                            | `"streaming"` or `"batch"`                                  |

## Security notes

- **API keys live only in the backend** `.env`. The extension calls the backend — it never holds secrets.
- The backend currently ships with permissive CORS for development. Lock this down before any public deployment.
- Supabase service role key is used server-side only via `getSupabaseAdmin()`.

## License

MIT
