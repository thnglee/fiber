# Model Selector & Configuration Feature — Development Plan

## Overview

Add a model switching module that lets admins select different LLM providers (OpenAI, Google Gemini, Anthropic Claude) and specific models within each provider, then tune per-model parameters (temperature, top-p, top-k, max tokens, min tokens) via a Settings UI. The selected model and its parameters persist in Supabase. Both streaming and full-request modes remain fully functional regardless of which model is active.

## Architecture Summary

```
Supabase (model_configurations table)
  ↓
GET /api/settings  →  active model + params loaded at request time
  ↓
llm.service.ts (generateCompletion / generateStreamingCompletion)
  ↓  routes to the correct provider SDK based on model.provider
  ├── OpenAI provider    → openai SDK
  ├── Gemini provider    → @google/generative-ai SDK
  └── Anthropic provider → @anthropic-ai/sdk

Model name + provider stored in:
  - evaluation_metrics.model
  - user_actions.model
```

---

## Provider & Model Support

| Provider  | Models |
|-----------|--------|
| OpenAI    | gpt-4o-mini, gpt-4o, gpt-4.1-mini, gpt-4.1 |
| Gemini    | gemini-2.0-flash, gemini-2.5-pro |
| Anthropic | claude-haiku-4-5, claude-sonnet-4-5, claude-sonnet-4-6 |

---

## Parameter Compatibility by Provider

| Parameter   | OpenAI | Gemini | Anthropic | Notes |
|-------------|--------|--------|-----------|-------|
| temperature | ✅ (0–2) | ✅ (0–2) | ✅ (0–1) | Already in use |
| top_p       | ✅ (0–1) | ✅ (0–1) | ✅ (0–1) | Nucleus sampling |
| max_tokens  | ✅ | ✅ | ✅ | Field name differs per SDK |
| top_k       | ❌ | ✅ | ✅ | Store always; forward only to Gemini/Anthropic |
| min_tokens  | ❌ | ❌ | ❌ | Store only, never forwarded |

---

## Step-by-Step Implementation Plan

---

### PHASE 1 — Database Migrations

#### Step 1 — Create `model_configurations` table

**File:** `backend/supabase/migrations/009_create_model_configurations.sql`

```sql
CREATE TABLE model_configurations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  provider      TEXT NOT NULL,                -- 'openai' | 'gemini' | 'anthropic'
  model_name    TEXT NOT NULL UNIQUE,         -- e.g. "gpt-4o-mini", "gemini-2.0-flash"
  display_name  TEXT NOT NULL,                -- e.g. "GPT-4o Mini"
  is_active     BOOLEAN NOT NULL DEFAULT FALSE,
  temperature   FLOAT NOT NULL DEFAULT 0.7,
  top_p         FLOAT,                        -- 0.0–1.0, nullable
  top_k         INTEGER,                      -- nullable; forwarded to Gemini/Anthropic only
  max_tokens    INTEGER,                      -- nullable
  min_tokens    INTEGER                       -- nullable, stored only
);

-- Only one model can be active at a time (enforced by partial unique index)
CREATE UNIQUE INDEX one_active_model ON model_configurations (is_active)
  WHERE is_active = TRUE;

-- Seed default models
INSERT INTO model_configurations (provider, model_name, display_name, is_active, temperature) VALUES
  -- OpenAI
  ('openai',    'gpt-4o-mini',          'GPT-4o Mini',         TRUE,  0.7),
  ('openai',    'gpt-4o',               'GPT-4o',              FALSE, 0.7),
  ('openai',    'gpt-4.1-mini',         'GPT-4.1 Mini',        FALSE, 0.7),
  ('openai',    'gpt-4.1',              'GPT-4.1',             FALSE, 0.7),
  -- Gemini
  ('gemini',    'gemini-2.0-flash',     'Gemini 2.0 Flash',    FALSE, 0.7),
  ('gemini',    'gemini-2.5-pro',       'Gemini 2.5 Pro',      FALSE, 0.7),
  -- Anthropic
  ('anthropic', 'claude-haiku-4-5',     'Claude Haiku',        FALSE, 0.7),
  ('anthropic', 'claude-sonnet-4-5',    'Claude Sonnet 4.5',   FALSE, 0.7),
  ('anthropic', 'claude-sonnet-4-6',    'Claude Sonnet 4.6',   FALSE, 0.7);

-- RLS: service role full access, authenticated users read
ALTER TABLE model_configurations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON model_configurations FOR ALL USING (auth.uid() IS NULL);
CREATE POLICY "authenticated_read" ON model_configurations FOR SELECT USING (auth.role() = 'authenticated');
```

**Checklist:**
- [ ] File created
- [ ] Applied to Supabase (via dashboard SQL editor or CLI)
- [ ] Seed data verified in Supabase table view

---

#### Step 2 — Add `model` column to `evaluation_metrics`

**File:** `backend/supabase/migrations/010_add_model_to_evaluation_metrics.sql`

```sql
ALTER TABLE evaluation_metrics ADD COLUMN model TEXT;
```

**Checklist:**
- [ ] File created
- [ ] Applied to Supabase

---

#### Step 3 — Add `model` column to `user_actions`

**File:** `backend/supabase/migrations/011_add_model_to_user_actions.sql`

```sql
ALTER TABLE user_actions ADD COLUMN model TEXT;
```

**Checklist:**
- [ ] File created
- [ ] Applied to Supabase

---

### PHASE 2 — Backend: Types, Config & LLM Service

#### Step 4 — Extend domain types

**File:** `backend/domain/types.ts`

Add `provider` to `ModelConfig`, extend `LLMCompletionOptions`:

```ts
// Add to LLMCompletionOptions:
model?: string
provider?: 'openai' | 'gemini' | 'anthropic'
temperature?: number
topP?: number
topK?: number        // forwarded to Gemini/Anthropic only
maxTokens?: number

// New type:
export interface ModelConfig {
  id: string
  provider: 'openai' | 'gemini' | 'anthropic'
  model_name: string
  display_name: string
  is_active: boolean
  temperature: number
  top_p: number | null
  top_k: number | null
  max_tokens: number | null
  min_tokens: number | null
}
```

**Checklist:**
- [ ] `LLMCompletionOptions` updated with `provider` and `topK`
- [ ] `ModelConfig` type added with `provider`

---

#### Step 5 — Extend request/response schemas

**File:** `backend/domain/schemas.ts`

Add optional `model` field to both `SummarizeRequestSchema` and `FactCheckRequestSchema`:

```ts
model: z.string().optional()
```

**Checklist:**
- [ ] `SummarizeRequestSchema` updated
- [ ] `FactCheckRequestSchema` updated

---

#### Step 6 — Create model configuration service

**File:** `backend/services/model-config.service.ts` (new file)

Responsibilities:
- `getActiveModelConfig(): Promise<ModelConfig>` — fetches the row where `is_active = TRUE`; falls back to `{ provider: 'openai', model_name: env.OPENAI_MODEL, temperature: env.OPENAI_TEMPERATURE }` if table is empty
- `getAllModelConfigs(): Promise<ModelConfig[]>` — fetches all rows ordered by `provider`, `display_name`
- `setActiveModel(modelName: string): Promise<void>` — sets `is_active = FALSE` for all, then `TRUE` for the target model
- `updateModelConfig(modelName: string, params: Partial<ModelConfig>): Promise<ModelConfig>` — updates parameters; sets `updated_at = NOW()`

**Checklist:**
- [ ] File created with all 4 functions
- [ ] Uses `getSupabaseAdmin()` (server-side only)
- [ ] Graceful fallback if table is empty (defaults to OpenAI)

---

#### Step 7 — Update `app.config.ts`

**File:** `backend/config/app.config.ts`

Change `getAIModelConfig()` to accept an optional `ModelConfig` override:

```ts
export function getAIModelConfig(override?: Partial<ModelConfig>): AIModelConfig {
  return {
    provider: override?.provider ?? 'openai',
    model: override?.model_name ?? env.OPENAI_MODEL,
    temperature: override?.temperature ?? env.OPENAI_TEMPERATURE,
    topP: override?.top_p ?? undefined,
    topK: override?.top_k ?? undefined,
    maxTokens: override?.max_tokens ?? undefined,
  }
}
```

**Checklist:**
- [ ] Function signature updated
- [ ] All existing call sites still work (no override = same behavior)

---

#### Step 8 — Install provider SDKs

```bash
cd backend
npm install @google/generative-ai @anthropic-ai/sdk
```

Add API keys to `.env`:
```
GEMINI_API_KEY=
ANTHROPIC_API_KEY=
```

Add to `backend/config/env.ts`:
```ts
GEMINI_API_KEY: z.string().optional(),
ANTHROPIC_API_KEY: z.string().optional(),
```

**Checklist:**
- [ ] `@google/generative-ai` installed
- [ ] `@anthropic-ai/sdk` installed
- [ ] Both API keys added to `.env` and `env.ts`

---

#### Step 9 — Update `llm.service.ts` to support all providers

**File:** `backend/services/llm.service.ts`

Refactor `generateCompletion()` and `generateStreamingCompletion()` to route to the correct SDK based on `options.provider`:

```ts
// Provider dispatch pattern:
switch (options.provider ?? 'openai') {
  case 'openai':    return callOpenAI(options, ...)
  case 'gemini':    return callGemini(options, ...)
  case 'anthropic': return callAnthropic(options, ...)
}
```

Parameter forwarding per provider:

| Param | OpenAI | Gemini | Anthropic |
|-------|--------|--------|-----------|
| temperature | ✅ | ✅ | ✅ |
| top_p | ✅ | ✅ | ✅ |
| top_k | ❌ skip | ✅ | ✅ |
| max_tokens | `max_completion_tokens` | `maxOutputTokens` | `max_tokens` |
| min_tokens | ❌ skip | ❌ skip | ❌ skip |

All three paths must:
1. Accept the same `LLMCompletionOptions` (with Zod schema)
2. Return the same `LLMCompletionResult` shape (including `model` used)
3. Support both full-request and streaming modes

**Checklist:**
- [ ] OpenAI path unchanged in behavior, refactored into helper
- [ ] Gemini path implemented (full-request + streaming)
- [ ] Anthropic path implemented (full-request + streaming)
- [ ] `top_k` forwarded to Gemini and Anthropic, skipped for OpenAI
- [ ] All paths return actual `model` name used

---

#### Step 10 — Update summarize and fact-check services

**Files:** `backend/services/summarize.service.ts`, `backend/services/fact-check.service.ts`

Both `performSummarize()`, `performSummarizeStream()`, and `performFactCheck()` gain a `modelConfig?: ModelConfig` parameter:

```ts
async function performSummarize(content, url, modelConfig?: ModelConfig) {
  const result = await generateJsonCompletion({
    // existing options...
    provider: modelConfig?.provider,
    model: modelConfig?.model_name,
    temperature: modelConfig?.temperature,
    topP: modelConfig?.top_p ?? undefined,
    topK: modelConfig?.top_k ?? undefined,
    maxTokens: modelConfig?.max_tokens ?? undefined,
  }, ...)
}
```

**Checklist:**
- [ ] `performSummarize()` updated
- [ ] `performSummarizeStream()` updated
- [ ] `performFactCheck()` updated

---

#### Step 11 — Update API routes

**Files:** `backend/app/api/summarize/route.ts`, `backend/app/api/fact-check/route.ts`

Each route handler must:
1. Parse `model` from request body
2. Call `getActiveModelConfig()` from model-config.service
3. If request body contains `model`, find that model's config and override
4. Pass full config to the service layer

```ts
const activeConfig = await getActiveModelConfig()
const modelConfig = requestBody.model
  ? { ...activeConfig, model_name: requestBody.model }
  : activeConfig
```

**Checklist:**
- [ ] `summarize/route.ts` loads active model config, passes to service
- [ ] `fact-check/route.ts` same
- [ ] Both streaming and non-streaming branches pass `modelConfig`

---

#### Step 12 — Store `model` in evaluation metrics and action tracking

**File:** `backend/services/evaluation.service.ts`

Add `model?: string` to `EvaluationData` and include in Supabase insert.

**File:** `backend/services/action-tracking.service.ts`

Add `model?: string` to `TrackActionParams` and include in `user_actions` insert.

**Checklist:**
- [ ] `EvaluationData` interface has `model?`
- [ ] `saveEvaluationMetrics()` inserts `model`
- [ ] `TrackActionParams` has `model?`
- [ ] `trackAction()` inserts `model`
- [ ] `model` is passed from route handlers down to both services

---

### PHASE 3 — Backend: Settings API

#### Step 13 — Create `/api/settings` route

**File:** `backend/app/api/settings/route.ts` (new file)

Endpoints:

```
GET  /api/settings
  Response: {
    active: ModelConfig,
    available: ModelConfig[]   // all models, grouped by provider in UI
  }

PATCH /api/settings/active
  Body: { model: string }
  Action: setActiveModel(model)
  Response: { success: true, active: ModelConfig }

PATCH /api/settings/config
  Body: { model: string, temperature?: number, top_p?: number, top_k?: number, max_tokens?: number, min_tokens?: number }
  Action: updateModelConfig(model, params)
  Response: { success: true, config: ModelConfig }
```

All PATCH routes: validate params with Zod before calling service.

**Checklist:**
- [ ] GET returns active + all configs
- [ ] PATCH /active switches active model
- [ ] PATCH /config updates per-model parameters
- [ ] Zod validation on all inputs
- [ ] Appropriate error responses (404 if model not found, 400 on validation failure)

---

### PHASE 4 — Frontend: Settings Page

#### Step 14 — Create Settings page

**File:** `backend/app/settings/page.tsx` (new file)

Layout (matches existing pages — `min-h-screen bg-gray-50 p-8`, `max-w-7xl mx-auto`):

```
Page Header
  h1: "Model Settings"
  p:  "Configure the active LLM provider and model"

Section 1 — Provider & Model Selection Card
  Models grouped by provider:

  ┌── OpenAI ──────────────────────────────┐
  │  ◉ GPT-4o Mini   ○ GPT-4o   ○ GPT-4.1 │
  └────────────────────────────────────────┘
  ┌── Google Gemini ────────────────────────┐
  │  ○ Gemini 2.0 Flash   ○ Gemini 2.5 Pro │
  └────────────────────────────────────────┘
  ┌── Anthropic Claude ─────────────────────┐
  │  ○ Claude Haiku   ○ Claude Sonnet 4.5  │
  └────────────────────────────────────────┘

  Each model card: border border-gray-200 rounded-lg p-4
  Selected: border-black bg-gray-50
  "Set Active" button appears when selection differs from current active

Section 2 — Model Parameters Card
  Shows params for the currently selected model (pre-filled from DB)

  Temperature    [slider 0–2 or number input]
  Top-P          [number input 0–1, optional]
  Top-K          [integer input, optional — shown with note "Forwarded to Gemini/Anthropic only"]
  Max Tokens     [integer input, optional]
  Min Tokens     [integer input, optional — labeled "Stored only, not forwarded"]

  Save button: bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800
  Success toast: green inline text after save
  Error state: red inline text

Loading skeleton: animate-pulse gray boxes while fetching
```

**State management:**
- Fetch `GET /api/settings` on mount
- Models displayed grouped by `provider`
- Switching model selection → updates local state + shows params for that model
- "Set Active" triggers `PATCH /api/settings/active`
- Editing params + "Save Parameters" triggers `PATCH /api/settings/config`

**Checklist:**
- [ ] Page file created
- [ ] Models grouped by provider (OpenAI / Gemini / Anthropic)
- [ ] Active model pre-selected on load
- [ ] Switching active model calls API
- [ ] Parameter form pre-filled per model
- [ ] Top-K field labeled to indicate it's skipped for OpenAI
- [ ] Save parameters calls API
- [ ] Loading state (skeleton)
- [ ] Error state
- [ ] Success feedback

---

#### Step 15 — Add Settings to Header navigation

**File:** `backend/components/Header.tsx`

Add to `navItems` array:
```ts
{ name: 'Settings', href: '/settings' }
```

**Checklist:**
- [ ] `Settings` nav item added
- [ ] Active state highlights correctly when on `/settings`

---

### PHASE 5 — Frontend: Debug Page Update

#### Step 16 — Add model selector to Debug page

**File:** `backend/app/debug/page.tsx`

Add a model selector at the top of the debug form:

```
Model Override (optional)
  <select> grouped by provider, from GET /api/settings
  Default: "Use active model (from Settings)"
```

This value is passed as `model` in the request body for Summarize and Fact-Check test calls.

**Checklist:**
- [ ] Fetch available models from `/api/settings` on mount
- [ ] Dropdown added before test sections, grouped by provider
- [ ] Model value included in summarize test request body
- [ ] Model value included in fact-check test request body

---

#### Step 17 — Show model used in Debug output

**File:** `backend/app/debug/page.tsx`

In the result display for both Summarize and Fact-Check:
- Add a badge: `Model: gpt-4o-mini` or `Model: gemini-2.0-flash` etc.
- Styled as `px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 text-xs font-medium`
- Model name comes from API response (`result.model`)

**Checklist:**
- [ ] Model badge shown in summarize result
- [ ] Model badge shown in fact-check result

---

### PHASE 6 — Frontend: Metrics Page Update

#### Step 18 — Add `model` column to Metrics table

**File:** `backend/app/metrics/page.tsx`

Add `Model` column to the evaluation metrics table:
- Header: `Model`
- Cell: badge styled as `px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs font-medium`
- Show `—` if null (for historical records before this feature)

**Checklist:**
- [ ] Column header added
- [ ] Cell renders model name badge or `—`

---

#### Step 19 — Add `model` filter to Metrics page

**File:** `backend/app/metrics/page.tsx`

Add `model` to the filters state and filter panel (alongside existing `mode` filter):

```tsx
<select value={filters.model} onChange={...} className="border border-gray-200 rounded-lg px-3 py-2 ...">
  <option value="">All Models</option>
  {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
</select>
```

Also update `getEvaluationMetrics()` in `evaluation.service.ts` to accept `model?` in `MetricFilters` and apply `.eq('model', filters.model)` if provided.

**Checklist:**
- [ ] `MetricFilters` type has `model?`
- [ ] `getEvaluationMetrics()` filters by model when provided
- [ ] GET `/api/metrics` passes model filter through
- [ ] Metrics page has model dropdown in filter panel
- [ ] Model list in filter populated from available models

---

## Implementation Order

```
Phase 1 (DB)     →  Phase 2 (Services + SDKs)  →  Phase 3 (Settings API)
     ↓
Phase 4 (Settings UI)
     ↓
Phase 5 (Debug page)  +  Phase 6 (Metrics page)  ← can run in parallel
```

---

## Files Changed Summary

| File | Action |
|------|--------|
| `backend/supabase/migrations/009_create_model_configurations.sql` | New — includes `provider` column |
| `backend/supabase/migrations/010_add_model_to_evaluation_metrics.sql` | New |
| `backend/supabase/migrations/011_add_model_to_user_actions.sql` | New |
| `backend/domain/types.ts` | Edit — add `ModelConfig` with `provider`, extend `LLMCompletionOptions` |
| `backend/domain/schemas.ts` | Edit — add `model?` to summarize + fact-check schemas |
| `backend/services/model-config.service.ts` | New |
| `backend/config/app.config.ts` | Edit — `getAIModelConfig()` accepts override including provider |
| `backend/config/env.ts` | Edit — add `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` |
| `backend/services/llm.service.ts` | Edit — provider dispatch (OpenAI / Gemini / Anthropic) |
| `backend/services/summarize.service.ts` | Edit — accept + forward `modelConfig?` |
| `backend/services/fact-check.service.ts` | Edit — accept + forward `modelConfig?` |
| `backend/app/api/summarize/route.ts` | Edit — load active config, pass to service |
| `backend/app/api/fact-check/route.ts` | Edit — same |
| `backend/services/evaluation.service.ts` | Edit — store `model` in metrics row |
| `backend/services/action-tracking.service.ts` | Edit — store `model` in action row |
| `backend/app/api/settings/route.ts` | New |
| `backend/app/settings/page.tsx` | New — models grouped by provider |
| `backend/components/Header.tsx` | Edit — add Settings nav item |
| `backend/app/debug/page.tsx` | Edit — model selector grouped by provider + model badge |
| `backend/app/metrics/page.tsx` | Edit — model column + model filter |
