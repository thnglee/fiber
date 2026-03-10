# Model Selector & Configuration Feature — Development Plan

## Overview

Add a model switching module that lets admins select different LLM providers (OpenAI, Google Gemini, Anthropic Claude) and specific models within each provider, then tune per-model parameters (temperature, top-p, top-k, max tokens, seed, frequency/presence penalty, etc.) via a Settings UI. The selected model and its parameters persist in Supabase. Both streaming and full-request modes remain fully functional regardless of which model is active.

If a provider's API key is not set in `.env`, any request routed to that provider returns a clear error: `"API key for <provider> has not been set up"` — no crash, no silent failure.

## Architecture Summary

```
Supabase (model_configurations table)
  ↓
GET /api/settings  →  active model + params loaded at request time
  ↓
llm.service.ts (generateCompletion / generateStreamingCompletion)
  ↓  routes to the correct provider SDK based on model.provider
  ├── OpenAI provider    → openai SDK
  ├── Gemini provider    → @google/generative-ai SDK   (requires GEMINI_API_KEY)
  └── Anthropic provider → @anthropic-ai/sdk            (requires ANTHROPIC_API_KEY)

Model name + provider stored in:
  - evaluation_metrics.model, .prompt_tokens, .completion_tokens, .estimated_cost_usd
  - user_actions.model
```

---

## Provider & Model Support

| Provider  | Model Name | Display Name | Type | Context Window |
|-----------|------------|--------------|------|----------------|
| OpenAI | gpt-4o-mini | GPT-4o Mini | standard | 128K |
| OpenAI | gpt-4o | GPT-4o | standard | 128K |
| OpenAI | gpt-4.1-mini | GPT-4.1 Mini | standard | 1M |
| OpenAI | gpt-4.1 | GPT-4.1 | standard | 1M |
| OpenAI | o4-mini | o4 Mini | reasoning | 200K |
| OpenAI | o3-mini | o3 Mini | reasoning | 200K |
| Gemini | gemini-2.0-flash-lite | Gemini 2.0 Flash Lite | standard | 1M |
| Gemini | gemini-2.0-flash | Gemini 2.0 Flash | standard | 1M |
| Gemini | gemini-2.5-flash | Gemini 2.5 Flash | standard | 1M |
| Gemini | gemini-2.5-pro | Gemini 2.5 Pro | standard | 1M |
| Anthropic | claude-haiku-4-5 | Claude Haiku 4.5 | standard | 200K |
| Anthropic | claude-sonnet-4-5 | Claude Sonnet 4.5 | standard | 200K |
| Anthropic | claude-sonnet-4-6 | Claude Sonnet 4.6 | standard | 200K |
| Anthropic | claude-opus-4-6 | Claude Opus 4.6 | standard | 200K |

**Reasoning models** (`model_type = 'reasoning'`): o4-mini, o3-mini. These do not support `temperature`, `top_p`, `frequency_penalty`, `presence_penalty`, or streaming in the same way. The backend skips those params; the UI hides them.

---

## Parameter Compatibility by Provider

| Parameter | OpenAI (std) | OpenAI (reasoning) | Gemini | Anthropic | Notes |
|---|---|---|---|---|---|
| temperature | ✅ (0–2) | ❌ skip | ✅ (0–2) | ✅ (0–1) | Hidden in UI for reasoning models |
| top_p | ✅ (0–1) | ❌ skip | ✅ (0–1) | ✅ (0–1) | Nucleus sampling |
| top_k | ❌ skip | ❌ skip | ✅ | ✅ | Forward to Gemini/Anthropic only |
| max_tokens | `max_completion_tokens` | `max_completion_tokens` | `maxOutputTokens` | `max_tokens` | Field name differs per SDK |
| min_tokens | ❌ stored only | ❌ stored only | ❌ stored only | ❌ stored only | Never forwarded |
| frequency_penalty | ✅ (-2–2) | ❌ skip | ❌ skip | ❌ skip | OpenAI standard only |
| presence_penalty | ✅ (-2–2) | ❌ skip | ❌ skip | ❌ skip | OpenAI standard only |
| seed | ✅ | ✅ | ✅ | ❌ skip | Reproducible outputs for evaluation |

---

## Step-by-Step Implementation Plan

---

### PHASE 1 — Database Migrations

#### Step 1 — Create `model_configurations` table

**File:** `backend/supabase/migrations/009_create_model_configurations.sql`

```sql
CREATE TABLE model_configurations (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW(),

  -- Identity
  provider                    TEXT NOT NULL,        -- 'openai' | 'gemini' | 'anthropic'
  model_name                  TEXT NOT NULL UNIQUE, -- e.g. "gpt-4o-mini"
  display_name                TEXT NOT NULL,        -- e.g. "GPT-4o Mini"
  model_type                  TEXT NOT NULL DEFAULT 'standard', -- 'standard' | 'reasoning'
  is_active                   BOOLEAN NOT NULL DEFAULT FALSE,

  -- Tunable parameters (user-editable in Settings UI)
  temperature                 FLOAT NOT NULL DEFAULT 0.7,
  top_p                       FLOAT,                -- 0.0–1.0, nullable
  top_k                       INTEGER,              -- nullable; Gemini/Anthropic only
  max_tokens                  INTEGER,              -- nullable
  min_tokens                  INTEGER,              -- nullable, stored only, never forwarded
  frequency_penalty           FLOAT,                -- -2.0–2.0; OpenAI standard only
  presence_penalty            FLOAT,                -- -2.0–2.0; OpenAI standard only
  seed                        INTEGER,              -- nullable; for reproducible evaluation outputs

  -- Model capability metadata (read-only, set at seed time)
  context_window              INTEGER NOT NULL,
  supports_streaming          BOOLEAN NOT NULL DEFAULT TRUE,
  supports_structured_output  BOOLEAN NOT NULL DEFAULT TRUE,
  supports_temperature        BOOLEAN NOT NULL DEFAULT TRUE,
  input_cost_per_1m           FLOAT,                -- USD per 1M input tokens
  output_cost_per_1m          FLOAT                 -- USD per 1M output tokens
);

-- Only one model can be active at a time
CREATE UNIQUE INDEX one_active_model ON model_configurations (is_active)
  WHERE is_active = TRUE;

-- Seed all models
INSERT INTO model_configurations (
  provider, model_name, display_name, model_type, is_active, temperature,
  context_window, supports_streaming, supports_structured_output, supports_temperature,
  input_cost_per_1m, output_cost_per_1m
) VALUES
  -- OpenAI standard
  ('openai','gpt-4o-mini',          'GPT-4o Mini',         'standard', TRUE,  0.7, 128000,  TRUE, TRUE, TRUE,   0.15,   0.60),
  ('openai','gpt-4o',               'GPT-4o',              'standard', FALSE, 0.7, 128000,  TRUE, TRUE, TRUE,   2.50,  10.00),
  ('openai','gpt-4.1-mini',         'GPT-4.1 Mini',        'standard', FALSE, 0.7, 1047576, TRUE, TRUE, TRUE,   0.40,   1.60),
  ('openai','gpt-4.1',              'GPT-4.1',             'standard', FALSE, 0.7, 1047576, TRUE, TRUE, TRUE,   2.00,   8.00),
  -- OpenAI reasoning
  ('openai','o4-mini',              'o4 Mini',             'reasoning',FALSE, 1.0, 200000,  TRUE, TRUE, FALSE,  1.10,   4.40),
  ('openai','o3-mini',              'o3 Mini',             'reasoning',FALSE, 1.0, 200000,  TRUE, TRUE, FALSE,  1.10,   4.40),
  -- Gemini
  ('gemini','gemini-2.0-flash-lite','Gemini 2.0 Flash Lite','standard',FALSE, 0.7, 1048576, TRUE, TRUE, TRUE,   0.075,  0.30),
  ('gemini','gemini-2.0-flash',     'Gemini 2.0 Flash',    'standard', FALSE, 0.7, 1048576, TRUE, TRUE, TRUE,   0.10,   0.40),
  ('gemini','gemini-2.5-flash',     'Gemini 2.5 Flash',    'standard', FALSE, 0.7, 1048576, TRUE, TRUE, TRUE,   0.15,   0.60),
  ('gemini','gemini-2.5-pro',       'Gemini 2.5 Pro',      'standard', FALSE, 0.7, 1048576, TRUE, TRUE, TRUE,   1.25,  10.00),
  -- Anthropic
  ('anthropic','claude-haiku-4-5',  'Claude Haiku 4.5',    'standard', FALSE, 0.7, 200000,  TRUE, TRUE, TRUE,   0.80,   4.00),
  ('anthropic','claude-sonnet-4-5', 'Claude Sonnet 4.5',   'standard', FALSE, 0.7, 200000,  TRUE, TRUE, TRUE,   3.00,  15.00),
  ('anthropic','claude-sonnet-4-6', 'Claude Sonnet 4.6',   'standard', FALSE, 0.7, 200000,  TRUE, TRUE, TRUE,   3.00,  15.00),
  ('anthropic','claude-opus-4-6',   'Claude Opus 4.6',     'standard', FALSE, 0.7, 200000,  TRUE, TRUE, TRUE,  15.00,  75.00);

-- RLS: service role full access, authenticated users read
ALTER TABLE model_configurations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all"    ON model_configurations FOR ALL    USING (auth.uid() IS NULL);
CREATE POLICY "authenticated_read"  ON model_configurations FOR SELECT USING (auth.role() = 'authenticated');
```

**Checklist:**
- [ ] File created
- [ ] Applied to Supabase (via dashboard SQL editor or CLI)
- [ ] Seed data verified in Supabase table view (14 rows)

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

#### Step 3b — Add cost & token columns to `evaluation_metrics`

**File:** `backend/supabase/migrations/012_add_cost_to_evaluation_metrics.sql`

```sql
ALTER TABLE evaluation_metrics
  ADD COLUMN prompt_tokens     INTEGER,
  ADD COLUMN completion_tokens INTEGER,
  ADD COLUMN estimated_cost_usd FLOAT;
```

Cost computed as:
```
(prompt_tokens / 1,000,000 * input_cost_per_1m) + (completion_tokens / 1,000,000 * output_cost_per_1m)
```
This provides per-run API cost data across model comparisons — valuable for the thesis evaluation chapter.

**Checklist:**
- [ ] File created
- [ ] Applied to Supabase

---

### PHASE 2 — Backend: Types, Config & LLM Service

#### Step 4 — Extend domain types

**File:** `backend/domain/types.ts`

Add `provider`, `modelType`, `seed`, `frequencyPenalty`, `presencePenalty` to `LLMCompletionOptions`; add full `ModelConfig` type:

```ts
// Extend LLMCompletionOptions:
model?: string
provider?: 'openai' | 'gemini' | 'anthropic'
modelType?: 'standard' | 'reasoning'
temperature?: number
topP?: number
topK?: number           // forwarded to Gemini/Anthropic only
maxTokens?: number
frequencyPenalty?: number  // OpenAI standard only
presencePenalty?: number   // OpenAI standard only
seed?: number              // OpenAI + Gemini only

// New type:
export interface ModelConfig {
  id: string
  provider: 'openai' | 'gemini' | 'anthropic'
  model_name: string
  display_name: string
  model_type: 'standard' | 'reasoning'
  is_active: boolean
  temperature: number
  top_p: number | null
  top_k: number | null
  max_tokens: number | null
  min_tokens: number | null
  frequency_penalty: number | null
  presence_penalty: number | null
  seed: number | null
  context_window: number
  supports_streaming: boolean
  supports_structured_output: boolean
  supports_temperature: boolean
  input_cost_per_1m: number | null
  output_cost_per_1m: number | null
}
```

**Checklist:**
- [ ] `LLMCompletionOptions` updated with all new fields
- [ ] `ModelConfig` type added with all columns including capability metadata

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
- `updateModelConfig(modelName: string, params: Partial<ModelConfig>): Promise<ModelConfig>` — updates tunable parameters only (capability metadata is read-only); sets `updated_at = NOW()`

**Checklist:**
- [ ] File created with all 4 functions
- [ ] Uses `getSupabaseAdmin()` (server-side only)
- [ ] Graceful fallback if table is empty (defaults to OpenAI)
- [ ] `updateModelConfig` rejects writes to read-only capability columns

---

#### Step 7 — Update `app.config.ts`

**File:** `backend/config/app.config.ts`

Change `getAIModelConfig()` to accept an optional `ModelConfig` override:

```ts
export function getAIModelConfig(override?: Partial<ModelConfig>): AIModelConfig {
  return {
    provider:         override?.provider        ?? 'openai',
    model:            override?.model_name      ?? env.OPENAI_MODEL,
    modelType:        override?.model_type      ?? 'standard',
    temperature:      override?.temperature     ?? env.OPENAI_TEMPERATURE,
    topP:             override?.top_p           ?? undefined,
    topK:             override?.top_k           ?? undefined,
    maxTokens:        override?.max_tokens      ?? undefined,
    frequencyPenalty: override?.frequency_penalty ?? undefined,
    presencePenalty:  override?.presence_penalty  ?? undefined,
    seed:             override?.seed            ?? undefined,
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
GEMINI_API_KEY=       # leave blank if not available — requests will return a clear error
ANTHROPIC_API_KEY=
```

Add to `backend/config/env.ts` (both optional — no startup crash if absent):
```ts
GEMINI_API_KEY:    z.string().optional(),
ANTHROPIC_API_KEY: z.string().optional(),
```

**Missing key behavior:** In `llm.service.ts`, before calling a provider, check that the required key is present. If not, throw a descriptive error:
```ts
if (!getEnvVar('GEMINI_API_KEY')) {
  throw new Error('API key for Gemini has not been set up')
}
```
This error propagates to the route handler and is returned as a 400/500 JSON response to the client.

**Checklist:**
- [ ] `@google/generative-ai` installed
- [ ] `@anthropic-ai/sdk` installed
- [ ] Both API keys added to `.env` (can be left blank)
- [ ] Both added as optional fields in `env.ts`
- [ ] Missing key check added at the top of each provider dispatch branch

---

#### Step 9 — Update `llm.service.ts` to support all providers

**File:** `backend/services/llm.service.ts`

Refactor `generateCompletion()` and `generateStreamingCompletion()` to route to the correct SDK based on `options.provider`:

```ts
switch (options.provider ?? 'openai') {
  case 'openai':    return callOpenAI(options, ...)
  case 'gemini':    return callGemini(options, ...)
  case 'anthropic': return callAnthropic(options, ...)
}
```

**Parameter forwarding per provider:**

| Param | OpenAI (std) | OpenAI (reasoning) | Gemini | Anthropic |
|---|---|---|---|---|
| temperature | ✅ | ❌ skip | ✅ | ✅ clamp to 0–1 |
| top_p | ✅ | ❌ skip | ✅ | ✅ |
| top_k | ❌ skip | ❌ skip | ✅ | ✅ |
| max_tokens | `max_completion_tokens` | `max_completion_tokens` | `maxOutputTokens` | `max_tokens` |
| frequency_penalty | ✅ | ❌ skip | ❌ skip | ❌ skip |
| presence_penalty | ✅ | ❌ skip | ❌ skip | ❌ skip |
| seed | ✅ | ✅ | ✅ | ❌ skip |
| min_tokens | ❌ skip | ❌ skip | ❌ skip | ❌ skip |

All three paths must:
1. Check for the required API key at the top; throw `'API key for <Provider> has not been set up'` if missing
2. Accept the same `LLMCompletionOptions`
3. Return the same `LLMCompletionResult` shape (including `model` used, `usage`)
4. Support both full-request and streaming modes

**Gemini notes:**
- Structured output: use `responseMimeType: 'application/json'` + `responseSchema`
- Streaming: `generateContentStream()` method
- `top_k` passed as `generationConfig.topK`

**Anthropic notes:**
- Structured output: prompt-based JSON instruction (no native JSON schema mode); validate with Zod after parsing
- Streaming: `messages.stream()` method
- `top_k` passed as `top_k`; temperature clamped to max 1.0

**Checklist:**
- [ ] OpenAI path unchanged in behavior, refactored into `callOpenAI()` helper
- [ ] Gemini path implemented (full-request + streaming)
- [ ] Anthropic path implemented (full-request + streaming)
- [ ] Missing API key check in each branch
- [ ] `frequency_penalty` / `presence_penalty` forwarded to OpenAI standard only
- [ ] `seed` forwarded to OpenAI + Gemini, skipped for Anthropic
- [ ] Temperature clamped to 0–1 for Anthropic
- [ ] All paths return actual `model` name + `usage` tokens

---

#### Step 10 — Update summarize and fact-check services

**Files:** `backend/services/summarize.service.ts`, `backend/services/fact-check.service.ts`

Both `performSummarize()`, `performSummarizeStream()`, and `performFactCheck()` gain a `modelConfig?: ModelConfig` parameter:

```ts
async function performSummarize(content, url, modelConfig?: ModelConfig) {
  const result = await generateJsonCompletion({
    // existing options...
    provider:         modelConfig?.provider,
    model:            modelConfig?.model_name,
    modelType:        modelConfig?.model_type,
    temperature:      modelConfig?.temperature,
    topP:             modelConfig?.top_p        ?? undefined,
    topK:             modelConfig?.top_k        ?? undefined,
    maxTokens:        modelConfig?.max_tokens   ?? undefined,
    frequencyPenalty: modelConfig?.frequency_penalty ?? undefined,
    presencePenalty:  modelConfig?.presence_penalty  ?? undefined,
    seed:             modelConfig?.seed         ?? undefined,
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
3. If request body contains `model`, find that model's config and use it instead
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

Add `model?`, `promptTokens?`, `completionTokens?`, `estimatedCostUsd?` to `EvaluationData` and include in Supabase insert.

Cost calculation at insert time:
```ts
const estimatedCostUsd = modelConfig
  ? (data.promptTokens ?? 0) / 1_000_000 * (modelConfig.input_cost_per_1m ?? 0)
  + (data.completionTokens ?? 0) / 1_000_000 * (modelConfig.output_cost_per_1m ?? 0)
  : undefined
```

**File:** `backend/services/action-tracking.service.ts`

Add `model?: string` to `TrackActionParams` and include in `user_actions` insert.

**Checklist:**
- [ ] `EvaluationData` interface has `model?`, `promptTokens?`, `completionTokens?`, `estimatedCostUsd?`
- [ ] `saveEvaluationMetrics()` inserts all four fields
- [ ] `TrackActionParams` has `model?`
- [ ] `trackAction()` inserts `model`
- [ ] `model` + token counts passed from route handlers down to both services

---

### PHASE 3 — Backend: Settings API

#### Step 13 — Create `/api/settings` route

**File:** `backend/app/api/settings/route.ts` (new file)

Endpoints:

```
GET  /api/settings
  Response: {
    active: ModelConfig,
    available: ModelConfig[]   // all models
  }

PATCH /api/settings/active
  Body: { model: string }
  Action: setActiveModel(model)
  Response: { success: true, active: ModelConfig }

PATCH /api/settings/config
  Body: {
    model: string,
    temperature?: number,
    top_p?: number,
    top_k?: number,
    max_tokens?: number,
    min_tokens?: number,
    frequency_penalty?: number,
    presence_penalty?: number,
    seed?: number
  }
  Action: updateModelConfig(model, params)
  Response: { success: true, config: ModelConfig }
```

All PATCH routes: validate params with Zod before calling service.

**Checklist:**
- [ ] GET returns active + all configs (including capability metadata)
- [ ] PATCH /active switches active model
- [ ] PATCH /config updates tunable parameters only (rejects writes to capability columns)
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

  ┌── OpenAI ──────────────────────────────────────────────────────────┐
  │  ◉ GPT-4o Mini   ○ GPT-4o   ○ GPT-4.1 Mini   ○ GPT-4.1          │
  │  ○ o4 Mini [reasoning]   ○ o3 Mini [reasoning]                     │
  └────────────────────────────────────────────────────────────────────┘
  ┌── Google Gemini ────────────────────────────────────────────────────┐
  │  ○ Gemini 2.0 Flash Lite  ○ Gemini 2.0 Flash                      │
  │  ○ Gemini 2.5 Flash       ○ Gemini 2.5 Pro                         │
  └────────────────────────────────────────────────────────────────────┘
  ┌── Anthropic Claude ─────────────────────────────────────────────────┐
  │  ○ Claude Haiku 4.5  ○ Claude Sonnet 4.5                           │
  │  ○ Claude Sonnet 4.6  ○ Claude Opus 4.6                            │
  └────────────────────────────────────────────────────────────────────┘

  Each model card shows: display name, context window badge, cost/1M tokens
  Reasoning models show a [reasoning] badge
  Selected: border-black bg-gray-50
  "Set Active" button appears when selection differs from current active

Section 2 — Model Parameters Card
  Shows tunable params for the currently selected model (pre-filled from DB)
  Capability-gated: params hidden/disabled based on model metadata

  Temperature    [slider 0–2, or 0–1 for Anthropic] — hidden for reasoning models
  Top-P          [number input 0–1, optional] — hidden for reasoning models
  Top-K          [integer input, optional — shown with note "Forwarded to Gemini/Anthropic only"]
  Max Tokens     [integer input, optional]
  Min Tokens     [integer input, optional — labeled "Stored only, not forwarded"]
  Frequency Penalty  [number -2–2, optional — shown with note "OpenAI standard only"]
  Presence Penalty   [number -2–2, optional — shown with note "OpenAI standard only"]
  Seed           [integer input, optional — labeled "For reproducible outputs; not supported by Anthropic"]

  Save button: bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800
  Success toast: green inline text after save
  Error state: red inline text

Section 3 — Model Info Card (read-only)
  Context Window:    128K / 1M / 200K
  Streaming:         ✅ Supported / ❌ Not supported
  Structured Output: ✅ / ❌
  Input cost:        $X.XX / 1M tokens
  Output cost:       $X.XX / 1M tokens

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
- [ ] Reasoning models show badge; temperature/top_p/penalties hidden for them
- [ ] Active model pre-selected on load
- [ ] Switching active model calls API
- [ ] Parameter form pre-filled per model
- [ ] Frequency/presence penalty fields shown for OpenAI standard only
- [ ] Seed field shown with note about Anthropic limitation
- [ ] Top-K field labeled to indicate it's skipped for OpenAI
- [ ] Read-only Model Info card shows context window + cost + capability flags
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

Also add a `Cost` column:
- Header: `Est. Cost`
- Cell: `$0.00042` formatted to 5 significant figures, or `—` if null

**Checklist:**
- [ ] Model column header + badge cell added
- [ ] Cost column header + formatted cell added
- [ ] Both show `—` for historical null rows

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
Phase 1 (DB migrations)  →  Phase 2 (Services + SDKs)  →  Phase 3 (Settings API)
     ↓
Phase 4 (Settings UI)
     ↓
Phase 5 (Debug page)  +  Phase 6 (Metrics page)  ← can run in parallel
```

---

## Files Changed Summary

| File | Action |
|------|--------|
| `backend/supabase/migrations/009_create_model_configurations.sql` | New — 14 models, full capability metadata |
| `backend/supabase/migrations/010_add_model_to_evaluation_metrics.sql` | New |
| `backend/supabase/migrations/011_add_model_to_user_actions.sql` | New |
| `backend/supabase/migrations/012_add_cost_to_evaluation_metrics.sql` | New — prompt_tokens, completion_tokens, estimated_cost_usd |
| `backend/domain/types.ts` | Edit — add `ModelConfig` with full fields; extend `LLMCompletionOptions` with seed/penalties/modelType |
| `backend/domain/schemas.ts` | Edit — add `model?` to summarize + fact-check schemas |
| `backend/services/model-config.service.ts` | New |
| `backend/config/app.config.ts` | Edit — `getAIModelConfig()` accepts override including all new params |
| `backend/config/env.ts` | Edit — add `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` (both optional) |
| `backend/services/llm.service.ts` | Edit — provider dispatch; missing key error; param forwarding per provider |
| `backend/services/summarize.service.ts` | Edit — accept + forward full `modelConfig?` |
| `backend/services/fact-check.service.ts` | Edit — accept + forward full `modelConfig?` |
| `backend/app/api/summarize/route.ts` | Edit — load active config, pass to service |
| `backend/app/api/fact-check/route.ts` | Edit — same |
| `backend/services/evaluation.service.ts` | Edit — store model, token counts, estimated cost |
| `backend/services/action-tracking.service.ts` | Edit — store `model` in action row |
| `backend/app/api/settings/route.ts` | New |
| `backend/app/settings/page.tsx` | New — full settings UI with capability-gated params + model info card |
| `backend/components/Header.tsx` | Edit — add Settings nav item |
| `backend/app/debug/page.tsx` | Edit — model selector + model badge in results |
| `backend/app/metrics/page.tsx` | Edit — model + cost columns + model filter |
