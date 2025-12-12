# Quick Setup Guide

## Prerequisites

- Node.js 18+ and npm/pnpm
- OpenAI API key (from OpenAI Platform)
- Tavily API key (from Tavily)

## Backend (development)

1. Install dependencies and start dev server:

```bash
cd backend
npm install    # or `pnpm install`
# Create a .env file with at least OPENAI_API_KEY and TAVILY_API_KEY
npm run dev
```

The backend runs on `http://localhost:3000` by default. The important API endpoints are under `/api` (notably `/api/summarize` and `/api/fact-check`).

Environment variables used by the backend (minimum required):

```env
OPENAI_API_KEY=your_openai_api_key_here
TAVILY_API_KEY=your_tavily_api_key_here
# Optional: model and temperature overrides
OPENAI_MODEL=gpt-4o-mini
OPENAI_TEMPERATURE=0.7
```

## Extension (development)

1. In a separate terminal, install and run the extension dev flow:

```bash
cd extension
npm install    # or `pnpm install`
# Optionally set PLASMO_PUBLIC_API_URL in extension/.env (default: http://localhost:3000/api)
npm run dev
```

Plasmo will open a browser with the extension loaded for development and enable hot reload.

## Build for production (extension & backend)

Extension:

```bash
cd extension
npm run build
# built artifacts are under extension/build/
```

Backend:

```bash
cd backend
npm run build
npm start
```

## Testing the extension

1. Open a supported Vietnamese news site (the extension includes host permissions for these):
   - `vnexpress.net`
   - `tuoitre.vn`
   - `dantri.com.vn`
   - `thanhnien.vn`

2. The summary sidebar should appear on article pages. Selecting text will surface the fact-check UI.

## Troubleshooting

- If the extension UI doesn't load: ensure the backend is running and that the extension is pointing to the correct API URL.
- If APIs return errors: check the backend terminal logs and confirm `OPENAI_API_KEY` and `TAVILY_API_KEY` are set.
- Styling issues: verify Tailwind is compiling and that content styles are loaded into the extension's Shadow DOM.

## Notes

- This project uses server-side content extraction (Readability + JSDOM) and server-side LLM calls; keep API keys only on the backend.
- The backend validates requests/responses with Zod schemas to keep contracts consistent between the extension and server.

