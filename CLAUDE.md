# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Fiber** — a browser extension + full-stack backend that automatically summarizes and fact-checks Vietnamese news articles using AI. University thesis project.
  
## Repository Structure

```
extension/   # Plasmo browser extension (React + TypeScript + Tailwind)
backend/     # Next.js 14 App Router API server
bert/        # BERTScore microservice (FastAPI + Python + PhoBERT)
shared/      # Shared TypeScript types
docs/        # Documentation
metrics_reports/  # Evaluation datasets and test results
```

## Commands

### Backend (`cd backend`)
```bash
npm install
npm run dev        # http://localhost:3000
npm run build
npm run lint
npm run test:streaming
```

### Extension (`cd extension`)
```bash
npm install
npm run dev        # Plasmo dev mode with hot reload
npm run build
npm run package    # Package for distribution
```

### BERTScore Microservice (`cd bert`)
```bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 7860
pytest bert/test_bert.py
```

## Architecture

```
Browser Extension (Plasmo)
  → injects summary sidebar & fact-check UI into Vietnamese news sites
  → calls backend API at PLASMO_PUBLIC_API_URL

Backend (Next.js API routes)
  /api/summarize      LLM summarization with optional token streaming
  /api/fact-check     search-augmented fact verification (Tavily → OpenAI)
  /api/metrics        evaluation data CRUD (Supabase)
  /api/dashboard      user action tracking
  /api/logs/stream    SSE debug feed
  /api/evaluate       trigger metrics computation

  Services layer (backend/services/):
    llm.service.ts              structured OpenAI calls with Zod output schemas
    summarize.service.ts        orchestrates summarization flow
    fact-check.service.ts       search → LLM pipeline
    evaluation.service.ts       ROUGE, BLEU computation + Supabase persistence
    bert.service.ts             calls BERTScore microservice (truncates to 256 tokens)
    content-extraction.service.ts  @mozilla/readability + JSDOM
    search.service.ts           Tavily wrapper
    compression.service.ts      compression rate calculation
    action-tracking.service.ts  logs actions to dashboard_actions table

BERTScore Microservice (FastAPI)
  POST /calculate-score  ← called by bert.service.ts
  Uses vinai/phobert-base for Vietnamese semantic similarity
  Deployable to Hugging Face Spaces via Dockerfile
```

## Key Files

| File | Purpose |
|------|---------|
| `backend/config/env.ts` | Environment variable validation (Zod) |
| `backend/domain/schemas.ts` | Zod schemas for all API request/response shapes |
| `backend/domain/types.ts` | TypeScript domain types |
| `shared/types.ts` | Shared types used by both extension and backend |
| `backend/supabase/migrations/` | DB schema migrations |

## Environment Variables (backend/.env)

```
OPENAI_API_KEY=
TAVILY_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
BERT_SERVICE_URL=         # URL of BERTScore microservice (optional)
OPENAI_MODEL=gpt-4o-mini  # optional override
OPENAI_TEMPERATURE=0.7    # optional override
```

Extension optionally uses `extension/.env`:
```
PLASMO_PUBLIC_API_URL=http://localhost:3000/api
```

## Database (Supabase)

Two main tables:
- `evaluation_metrics` — ROUGE/BLEU/BERTScore/compression/latency per summarization
- `dashboard_actions` — Extension user action log (summarize, fact-check events)

## Supported News Sites

vnexpress.net, tuoitre.vn, dantri.com.vn, thanhnien.vn

## Notes

- All API request/response shapes validated with Zod (`backend/domain/schemas.ts`)
- BERTScore input is truncated to 256 tokens before calling the microservice
- Supabase service role key is server-side only via `getSupabaseAdmin()`
- Evaluation datasets stored in `metrics_reports/` across 5 topic categories: thoi_su, phap_luat, kinh_te, giao_duc, van_hoa
