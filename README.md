# Fiber

A lightweight browser extension + backend that automatically summarizes and fact-checks Vietnamese news articles using AI.

## What this repo contains

- `extension/` — Plasmo-based browser extension (React + TypeScript + Tailwind). Contains content scripts, UI components, and the popup.
- `backend/` — Next.js (App Router) backend that exposes the API endpoints used by the extension.
- `docs/` — Documentation and notes.

## Features

- Auto-summarize article content (server-side summarization using an LLM)
- Fact-check highlighted text by searching Vietnamese news sources and asking the LLM to score/justify the result
- Centralized backend services for content extraction (Readability), search (Tavily), and LLM orchestration (OpenAI)

## Tech stack

- Extension: Plasmo, React, TypeScript, Tailwind CSS
- Backend: Next.js (App Router), TypeScript, Zod for validation
- AI / search integrations: OpenAI (LLM) and Tavily (search)

## Quick run (development)

Start the backend first (the extension talks to this API):

```bash
cd backend
npm install    # or `pnpm install`
# Create a .env with at least OPENAI_API_KEY and TAVILY_API_KEY
npm run dev
```

The backend runs on `http://localhost:3000` by default and exposes the API under `/api` (notably `/api/summarize` and `/api/fact-check`).

Run the extension in a second terminal:

```bash
cd extension
npm install    # or `pnpm install`
# Optionally set PLASMO_PUBLIC_API_URL in extension/.env to point to your backend (default: http://localhost:3000/api)
npm run dev
```

Plasmo's dev flow will open a browser with the extension loaded for development and enable hot reload.

## Key API endpoints

- `POST /api/summarize` — Summarize article content. Request body: `{ content?: string, url?: string, debug?: boolean }`. Response: `{ summary, keyPoints, readingTime, debug? }`.
- `POST /api/fact-check` — Fact-check a selected text. Request body: `{ text: string, debug?: boolean }`. Response: `{ score, reason, sources, verified, debug? }`.

Both endpoints validate inputs and outputs with Zod schemas (`backend/domain/schemas.ts`).

## Notable implementation points

- The backend uses `@mozilla/readability` + `jsdom` to extract readable article content when given a URL.
- LLM calls are centralized in `backend/services/llm.service.ts`. The service attempts structured JSON output using Zod -> json-schema and falls back to parsing code blocks or raw text.
- Search is handled via a Tavily client wrapper that returns a list of source URLs and aggregated source content used to augment prompts.
- There is an in-memory logger (`backend/lib/logger.ts`) that captures recent events and supports subscriptions for live debugging.

## Supported news sites (extension host permissions)

- `vnexpress.net`
- `tuoitre.vn`
- `dantri.com.vn`
- `thanhnien.vn`

## Security & running notes

- Keep your OpenAI and Tavily API keys private — they must live in the backend `.env` (the extension calls the backend; it should never contain secret keys).
- The backend currently uses permissive CORS for development. Lock this down before deploying to production.

## Next steps you might want to take

- Add tests for critical services (LLM parsing, schema validation, content extraction)
- Add basic rate-limiting to protect the API and control AI usage costs
- Add monitoring/metrics for LLM usage and errors

## License

MIT

