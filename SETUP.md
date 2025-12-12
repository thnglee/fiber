# Quick Setup Guide

## Prerequisites

- Node.js 18+ and npm/pnpm
- OpenAI API key from [OpenAI Platform](https://platform.openai.com/api-keys)
- Tavily API key from [Tavily](https://tavily.com)

## Step 1: Backend Setup

```bash
cd backend
npm install
# or
pnpm install
```

Create `.env` file:
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

Start the backend:
```bash
npm run dev
# or
pnpm dev
```

Backend will run on `http://localhost:3000`

### Database (Supabase + Prisma)
- Confirm `.env` has `SUPABASE_DB_URL` with the Postgres connection string from Supabase (include `?sslmode=require` if provided).

- Note: The repository includes Prisma packages in `backend/package.json`, but it does not include a `prisma/schema.prisma` or migration files by default. If you plan to use the DB features follow these steps:
   1. Add a `prisma/schema.prisma` file under `backend/` describing your schema.
   2. Ensure `SUPABASE_DB_URL` (or `DATABASE_URL`) is set in your `.env`.
   3. Run `npx prisma generate` to build the client.
   4. Create initial migrations: `npx prisma migrate dev --name init`

If you don't need persistence right now you can skip the Prisma steps — the backend will still run and provide the summarize/fact-check APIs that call external AI/search services.

## Step 2: Extension Setup

In a new terminal:

```bash
cd extension
npm install
# or
pnpm install
```

(Optional) Create `.env` file if you want to use a different API URL:
```env
PLASMO_PUBLIC_API_URL=http://localhost:3000/api
```

Start the extension development:
```bash
npm run dev
# or
pnpm dev
```

This will:
- Build the extension
- Open Chrome/Edge with the extension loaded
- Enable hot-reload for development

## Step 3: Test the Extension

1. Navigate to a supported news site:
   - vnexpress.net
   - tuoitre.vn
   - dantri.com.vn
   - thanhnien.vn

2. The summary sidebar should appear automatically on article pages

3. Select text on the page to see the fact-check tooltip

## Building for Production

### Extension
```bash
cd extension
npm run build
# or
pnpm build
```

The built extension will be in `extension/build/chrome-mv3-prod/`

### Backend
```bash
cd backend
npm run build
npm start
# or
pnpm build
pnpm start
```

## Troubleshooting

### Extension not loading
- Make sure the backend is running on port 3000
- Check browser console for errors
- Verify API keys are set in backend `.env`

### API errors
- Check backend logs in terminal
- Verify API keys are correct
- Ensure CORS is enabled (already configured in `next.config.js`)

### Styling issues
- Make sure Tailwind CSS is properly compiled
- Check that `style.css` is imported in content scripts
- Verify Shadow DOM styles are injected via `getStyle()`

