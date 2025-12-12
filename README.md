# Fiber

A browser extension that automatically summarizes and fact-checks Vietnamese news articles using AI.

## Features

- **Auto-Summarize**: Automatically summarizes news articles upon loading using LLMs
- **Fact-Check**: Allows users to highlight text and verify its accuracy against trusted Vietnamese sources

## Tech Stack

- **Extension**: Plasmo (React + TypeScript + Tailwind CSS)
- **Backend**: Next.js (App Router) API routes
- **AI Services**: 
  - OpenAI GPT-4o-mini (LLM)
  - Tavily AI (RAG Search)

## Project Structure

```
/fiber
├── extension/          # Plasmo browser extension
│   ├── contents/       # Content scripts (UI logic)
│   ├── components/     # Reusable React components
│   └── lib/            # Utilities and API client
├── backend/            # Next.js API backend
│   └── app/api/        # API routes
└── docs/               # Documentation
```

## Setup

### Extension Setup

1. Navigate to the extension directory:
```bash
cd extension
```

2. Install dependencies:
```bash
npm install
# or
pnpm install
```

3. Create a `.env` file (optional, for custom API URL):
```env
PLASMO_PUBLIC_API_URL=http://localhost:3000/api
```

4. Run development server:
```bash
npm run dev
# or
pnpm dev
```

### Database (Supabase + Prisma)
- Ensure `SUPABASE_DB_URL` in `.env` is the full Postgres connection string from Supabase (include `?sslmode=require` if provided).
- After env is set, run `npx prisma generate` to build the Prisma client.
- Create the initial tables with `npx prisma migrate dev --name init` (this uses the schema in `prisma/schema.prisma`).

5. Build for production:
```bash
npm run build
# or
pnpm build
```

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
# or
pnpm install
```

3. Create a `.env` file:
```env
OPENAI_API_KEY=your_openai_api_key_here
TAVILY_API_KEY=your_tavily_api_key_here
SUPABASE_URL=your_supabase_project_url
SUPABASE_DB_URL=your_supabase_postgres_connection_string
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Optional: AI Model Configuration (defaults shown)
OPENAI_MODEL=gpt-4o-mini
OPENAI_TEMPERATURE=0.7
```

4. Run development server:
```bash
npm run dev
# or
pnpm dev
```

The API will be available at `http://localhost:3000/api`

## Development

### Phase 1: Foundation & Sidebar (Day 1)
- ✅ Setup Plasmo + Tailwind CSS
- ✅ Create SummarySidebar component
- ✅ Implement Readability content extraction
- ✅ Setup Next.js /api/summarize endpoint
- ✅ Connect Sidebar to Backend

### Phase 2: Fact Check & RAG (Day 2)
- ✅ Build text selection logic
- ✅ Setup /api/fact-check endpoint
- ✅ Build FactCheckModal with Trust Meter
- ✅ Handle loading states

### Phase 3: Polish & Style (Day 3)
- Refine Tailwind classes (Dub.co style)
- Ensure Shadow DOM styling works correctly
- Add error handling and retry buttons
- Build and test extension

## Supported Sites

- vnexpress.net
- tuoitre.vn
- dantri.com.vn
- thanhnien.vn

## License

MIT

