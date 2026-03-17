# Development Plan: Routing Mechanism & Output Fusion

## Feature Overview

Implement an intelligent routing mechanism that classifies article complexity and routes
summarization requests to the most appropriate model among three candidates:

- **PhoGPT-4B-Chat** (`vinai/PhoGPT-4B-Chat`) — Vietnamese instruction-following, 8K context
- **ViT5-large** (`VietAI/vit5-large-vietnews-summarization`) — Vietnamese news-specialized seq2seq, 1K context
- **GPT-4o** (existing OpenAI integration) — Multilingual baseline, 128K context

The system routes to one primary model based on task complexity, with fallback to GPT-4o.
An **evaluation mode** runs all three models in parallel, fuses outputs via BERTScore-based
quality scoring, and returns the optimal summary — used for thesis comparison experiments.

```
Article Input
    │
    ▼
┌─────────────────────────────────────────┐
│           Routing Mechanism             │
│  • Classify complexity (length, topic)  │
│  • Select primary model                 │
│  • Define fallback chain                │
└──────────┬──────────┬──────────┬────────┘
           │          │          │
           ▼          ▼          ▼
     PhoGPT-4B    ViT5-large   GPT-4o
   (instruct)   (seq2seq)    (baseline)
           │          │          │
           └──────────┴──────────┘
                      │
                      ▼
          ┌───────────────────────┐
          │     Output Fusion     │   (evaluation mode only)
          │  BERTScore quality    │
          │  Voting / selection   │
          └───────────┬───────────┘
                      │
                      ▼
              Optimal Summary
```

---

## Phase 1 — DB Migrations

**Goal:** Add database support for routing decisions and per-model comparison data.

### Step 1 — `013_create_routing_decisions.sql`

New table to log every routing decision for analytics and thesis evaluation.

```sql
CREATE TABLE routing_decisions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NOTE: evaluation_metrics points back here via routing_id FK (added in migration 015).
  -- No FK stored here to avoid circular dependency at insert time.
  article_length  INTEGER,                   -- char count of input
  article_tokens  INTEGER,                   -- estimated token count
  category        TEXT,                      -- from LLM output (thoi_su, kinh_te, etc.)
  complexity      TEXT NOT NULL,             -- 'short' | 'medium' | 'long'
  routing_mode    TEXT NOT NULL,             -- 'auto' | 'evaluation' | 'forced'
  selected_model  TEXT NOT NULL,             -- model that was actually used
  fallback_used   BOOLEAN DEFAULT FALSE,
  fallback_reason TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### Step 2 — `014_create_model_comparison_results.sql`

Stores per-model outputs when evaluation mode runs all three in parallel.

```sql
CREATE TABLE model_comparison_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routing_id      UUID REFERENCES routing_decisions(id) ON DELETE CASCADE,
  model_name      TEXT NOT NULL,
  summary         TEXT NOT NULL,
  bert_score      NUMERIC(6,4),
  rouge1          NUMERIC(6,4),
  prompt_tokens   INTEGER,
  completion_tokens INTEGER,
  estimated_cost_usd NUMERIC(10,6),
  latency_ms      INTEGER,
  selected        BOOLEAN DEFAULT FALSE,     -- TRUE for the winner
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### Step 3 — `015_add_routing_id_to_evaluation_metrics.sql`

Link existing evaluation metrics rows back to routing decisions.

```sql
ALTER TABLE evaluation_metrics
  ADD COLUMN routing_id UUID REFERENCES routing_decisions(id);
```

---

## Phase 2 — HuggingFace Provider Integration

**Goal:** Add HuggingFace Inference API as a 4th LLM provider in the existing dispatch chain.

### Step 4 — Environment Variables (`backend/config/env.ts`, `backend/domain/schemas.ts`)

Add to `EnvSchema`:
```
HF_API_KEY=          # HuggingFace API token (required for PhoGPT + ViT5)
HF_TIMEOUT_MS=30000  # optional, default 30s
```

Update `backend/config/env.ts` Zod schema accordingly.

### Step 5 — Types (`backend/domain/types.ts`)

Add `'huggingface'` to the provider union:
```ts
provider: 'openai' | 'gemini' | 'anthropic' | 'huggingface'
```

Add `HFModelType` enum and extend `LLMCompletionOptions`:
```ts
hfModelId?: string    // full HF model ID e.g. 'VietAI/vit5-large-vietnews-summarization'
hfTaskType?: 'text-generation' | 'text2text-generation'
```

Add `RoutingDecision` and `ModelComparisonResult` interfaces mirroring the new DB tables.

### Step 6 — `016_add_hf_models_to_model_configurations.sql` (new migration)

Add two new rows to `model_configurations` for HuggingFace models:

| field | PhoGPT | ViT5 |
|---|---|---|
| provider | `huggingface` | `huggingface` |
| model_name | `vinai/PhoGPT-4B-Chat` | `VietAI/vit5-large-vietnews-summarization` |
| display_name | `PhoGPT-4B-Chat` | `ViT5-large (VN News)` |
| model_type | `chat` | `base` |
| context_window | 8192 | 1024 |
| supports_streaming | false | false |
| supports_structured_output | false | false |
| supports_temperature | true | true |
| input_cost_per_1m | 0 | 0 |
| output_cost_per_1m | 0 | 0 |

### Step 7 — `backend/services/llm.service.ts`

Add `callHuggingFace()` function:

- For `text2text-generation` (ViT5): POST to
  `https://api-inference.huggingface.co/models/{modelId}`
  with `{ inputs: prompt }`, parse `[{ generated_text }]` response.
  **Input truncation**: ViT5 has a 1024-token context window — truncate prompt to
  ~800 tokens (≈3200 chars) before sending to avoid exceeding the limit.
- For `text-generation` (PhoGPT): same endpoint, chat-style prompt formatting,
  parse `[{ generated_text }]` stripping the input prefix.
- No streaming (HF Inference API does not guarantee streaming for these models).
- Returns `LLMCompletionResult<string>` with `usage: null` (HF API does not return token counts).
- Throws clear error if `HF_API_KEY` missing.

Wire into `generateCompletion()` dispatch switch **before the `default` case**
(current code is `case 'openai': default:` — the HF case must be explicit, not fall through):
```ts
case 'huggingface': return callHuggingFace(options, config)
case 'openai':
default:
  return callOpenAI(options, config, schema)
```

Note: `generateJsonCompletion` for HF models will use prompt-engineering to instruct
JSON output (append schema as plain text instructions), then `JSON.parse()` the response —
no native structured output support. Use `extractJsonFromResponse()` (already exported) for cleanup.

---

## Phase 3 — Routing Logic Service

**Goal:** Build the classifier that decides which model to use for a given article.

### Step 8 — `backend/services/routing.service.ts` (new file)

#### Complexity Classification

```ts
type ArticleComplexity = 'short' | 'medium' | 'long'

function classifyComplexity(text: string): ArticleComplexity {
  const tokens = estimateTokenCount(text)   // chars / 4 approximation
  if (tokens <= 400)  return 'short'
  if (tokens <= 1500) return 'medium'
  return 'long'
}
```

#### Model Selection Rules

```
short  (≤400 tokens)  → ViT5-large      (seq2seq specialized, fits context)
medium (≤1500 tokens) → PhoGPT-4B-Chat  (instruction-following, good range)
long   (>1500 tokens) → GPT-4o          (128K context, handles full articles)
```

#### Fallback Chain

```
ViT5     → fallback: PhoGPT → fallback: GPT-4o
PhoGPT   → fallback: GPT-4o
GPT-4o   → no fallback (always available if API key set)
```

#### Exports

```ts
export function selectModel(text: string, availableProviders: Set<string>): RoutingDecision
export function getFallbackModel(failed: string): string | null
export function estimateTokenCount(text: string): number
```

`availableProviders` is built at runtime from which API keys are configured — prevents
routing to a model whose key is missing.

### Step 9 — `backend/services/routing.service.ts` — Mode Detection

```ts
type RoutingMode = 'auto' | 'evaluation' | 'forced'
```

- `auto` — use `selectModel()` to pick the best model
- `evaluation` — run all 3 in parallel, return the highest BERTScore winner
- `forced` — caller specifies `model` explicitly (existing behavior, unchanged)

Expose `resolveRoutingMode(request: SummarizeRequest): RoutingMode`.

---

## Phase 4 — Output Fusion Service

**Goal:** In evaluation mode, run all three models in parallel and select the best summary.

### Step 10 — `backend/services/fusion.service.ts` (new file)

#### Main export

```ts
export async function runFusedSummarization(
  text: string,
  website: string | undefined,
  models: ModelConfig[]
): Promise<FusionResult>
```

#### Logic

1. `Promise.allSettled()` — call `performSummarize()` for each model concurrently.
   Record latency per model with `performance.now()`.
   Note: `performSummarize` already accepts an optional `ModelConfig` param (verified in codebase) —
   pass each model's config directly without touching the active model setting.
2. Collect fulfilled results only (rejected = model failure, log and skip).
3. For each fulfilled summary, call `calculateBertScore(originalArticleText, summary)`
   (existing `bert.service.ts`). The **original article text** is the reference — there is no
   ground-truth human summary in real-time mode. Requires `BERT_SERVICE_URL` to be configured;
   if missing/null BERTScore, fall back to ROUGE-1 for winner selection.
4. **Select winner**: highest BERTScore (or ROUGE-1 if BERTScore unavailable).
   Tie-break: prefer ViT5 → PhoGPT → GPT-4o (prefer cheaper/specialized over general).
5. Return `FusionResult`:
   ```ts
   {
     winner: SummarizeResponse & { model: string }
     candidates: ModelComparisonResult[]   // all models with scores
     routingId: string
   }
   ```

#### Persistence

After selection, write one row to `routing_decisions` and N rows to
`model_comparison_results` (marking `selected = true` on the winner).

---

## Phase 5 — API Integration

**Goal:** Wire routing and fusion into the `/api/summarize` endpoint.

### Step 11 — `backend/domain/schemas.ts`

Extend `SummarizeRequestSchema`:
```ts
routing_mode: z.enum(['auto', 'evaluation', 'forced']).optional()
```

Extend `SummarizeResponseSchema`:
```ts
routing?: {
  selected_model: string
  complexity: string
  fallback_used: boolean
  candidates?: ModelComparisonResult[]   // only in evaluation mode
}
```

### Step 12 — `backend/app/api/summarize/route.ts`

Update POST handler:

```
if routing_mode === 'evaluation':
    → call fusion.service.ts runFusedSummarization()
    → return winner + candidates in response

else if routing_mode === 'auto' (or unset):
    → call routing.service.ts selectModel()
    → load ModelConfig for selected model
    → call performSummarize() with that config
    → on failure: getFallbackModel() → retry once
    → log routing_decision to DB

else (forced / existing behavior):
    → existing model override logic unchanged
```

Streaming (`?stream=true`) is **not supported in evaluation mode** — return 400 if both are requested.

**Auto mode + streaming**: if routing selects a HF model (`supports_streaming: false`) but
`?stream=true` was requested, **silently fall back to sync mode** for that request — do NOT
return 400. Log a warning. This prevents UX breakage when the user has streaming enabled globally.

### Step 13 — `backend/app/api/routing/route.ts` (new file)

```
GET /api/routing/stats
```

Returns routing analytics:
- Distribution of models selected (last 7/30 days)
- Average BERTScore per model
- Fallback rate per model
- Complexity breakdown (short/medium/long %)

---

## Phase 6 — Settings Page Update

**Goal:** Let users configure routing behavior from the settings UI.

### Step 14 — `backend/app/settings/page.tsx`

Add **Routing Configuration** section below model selector:

- **Routing Mode** toggle: `Auto` / `Evaluation` / `Forced` (radio group)
  - Auto: system picks model based on complexity
  - Evaluation: run all models, pick best (slower, for research)
  - Forced: use the currently active model (existing behavior)
- **Complexity Thresholds** (optional, collapsible): editable short/medium/long
  token cutoffs with current defaults shown
- **Available Models for Routing**: checklist showing which HF models are accessible
  (green checkmark if `HF_API_KEY` is set, grey lock if not)

Persist routing mode via a new `/api/settings/routing` endpoint (GET/POST).

### Step 15 — `backend/app/api/settings/routing/route.ts` (new file)

```
GET  /api/settings/routing  → { routing_mode, complexity_thresholds }
POST /api/settings/routing  → update routing_mode
```

Store in `app_settings` table (simple key-value). Add migration **`017_create_app_settings.sql`**:

```sql
CREATE TABLE app_settings (
  key    TEXT PRIMARY KEY,
  value  JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
-- Seed default routing config
INSERT INTO app_settings (key, value)
VALUES ('routing_config', '{"routing_mode":"forced","complexity_thresholds":{"short":400,"medium":1500}}');
```

---

## Phase 7 — Debug Page Update

**Goal:** Show routing decisions and per-model comparison in the debug UI.

### Step 16 — `backend/app/debug/page.tsx`

**Routing mode selector** (above existing model dropdown):
- Radio: Auto / Evaluation / Forced
- When `Evaluation` is selected, hide the model override dropdown (irrelevant)

**Routing result panel** (shown after summarization):
- Badge: `Complexity: medium` with colour coding (green/yellow/red)
- Badge: `Routed to: PhoGPT-4B-Chat` + `Fallback: No`
- If evaluation mode: expandable **Model Comparison Table**:

  | Model | BERTScore | ROUGE-1 | Latency | Cost | Winner |
  |---|---|---|---|---|---|
  | GPT-4o | 0.872 | 0.541 | 1.2s | $0.00031 | — |
  | PhoGPT-4B-Chat | 0.891 | 0.563 | 3.4s | $0.00 | ✓ |
  | ViT5-large | 0.843 | 0.512 | 2.1s | $0.00 | — |

### Step 17 — Routing stats mini-dashboard card

Add a collapsible **Routing Stats** card at the bottom of the debug page:
- Pie/bar chart: % of requests routed to each model (last 50 requests)
- Data from `GET /api/routing/stats`

---

## Phase 8 — Metrics Page Update

**Goal:** Surface routing analytics and model comparison data in the metrics UI.

### Step 18 — `backend/app/metrics/page.tsx`

**New "Routing" tab** (alongside existing metrics table):
- Summary cards: total routed requests, fallback rate, avg BERTScore per model
- Bar chart: model selection distribution over time
- Table: recent routing decisions with complexity, selected model, fallback flag, BERTScore winner

**Evaluation mode results** sub-section:
- Filterable table of `model_comparison_results` rows
- Columns: Date, Article excerpt, Model, BERTScore, ROUGE-1, Latency, Cost, Selected
- Export to CSV button (for thesis data collection)

### Step 19 — `backend/app/api/metrics/route.ts`

Add optional query params:
```
?view=routing          → return routing_decisions + model_comparison_results
?routing_mode=evaluation  → filter to evaluation mode runs only
```

---

## File Change Summary

### New Files
| File | Purpose |
|------|---------|
| `backend/services/routing.service.ts` | Complexity classifier + model selector + fallback |
| `backend/services/fusion.service.ts` | Parallel model execution + BERTScore-based selection |
| `backend/app/api/routing/route.ts` | GET /api/routing/stats |
| `backend/app/api/settings/routing/route.ts` | GET/POST routing configuration |
| `backend/supabase/migrations/013_create_routing_decisions.sql` | Routing decisions table |
| `backend/supabase/migrations/014_create_model_comparison_results.sql` | Per-model results table |
| `backend/supabase/migrations/015_add_routing_id_to_evaluation_metrics.sql` | FK to routing_decisions |
| `backend/supabase/migrations/016_add_hf_models_to_model_configurations.sql` | Seed PhoGPT + ViT5 rows |
| `backend/supabase/migrations/017_create_app_settings.sql` | Key-value settings table + routing defaults |

### Modified Files
| File | Change |
|------|--------|
| `backend/config/env.ts` | Add `HF_API_KEY`, `HF_TIMEOUT_MS` |
| `backend/domain/schemas.ts` | Add `routing_mode` to request/response schemas |
| `backend/domain/types.ts` | Add `huggingface` provider, `RoutingDecision`, `ModelComparisonResult`, `FusionResult` |
| `backend/services/llm.service.ts` | Add `callHuggingFace()`, wire into dispatch |
| `backend/app/api/summarize/route.ts` | Add routing/evaluation mode branching |
| `backend/app/settings/page.tsx` | Add routing configuration section |
| `backend/app/debug/page.tsx` | Add routing panel + model comparison table |
| `backend/app/metrics/page.tsx` | Add Routing tab + evaluation results table |
| `backend/app/api/metrics/route.ts` | Add `?view=routing` query support |

---

## Environment Variables to Add

```
# backend/.env
HF_API_KEY=hf_xxxxxxxxxxxxxxxxxxxx   # required for PhoGPT + ViT5
HF_TIMEOUT_MS=30000                  # optional, default 30000
BERT_SERVICE_URL=https://...         # already exists — required for fusion BERTScore selection
```

> **Note:** `BERT_SERVICE_URL` is an existing optional variable (already in the codebase).
> In evaluation/fusion mode it becomes effectively required — without it, winner selection
> falls back to ROUGE-1. Ensure it is set for thesis experiments.

---

## Implementation Order (recommended)

```
Phase 1  →  Phase 2  →  Phase 3  →  Phase 4  →  Phase 5
(DB)        (HF Provider) (Routing)   (Fusion)    (API)
                                                    ↓
                                    Phase 8  ←  Phase 6 → Phase 7
                                   (Metrics)  (Settings)  (Debug)
```

Phases 6, 7, 8 can be done in parallel after Phase 5 is stable.

---

## Thesis Contribution Points

1. **Novel routing algorithm for Vietnamese text** — complexity-based model selection
   with open-source Vietnamese models as primary, GPT-4o as fallback
2. **First comprehensive comparison** of PhoGPT-4B-Chat vs ViT5-large vs GPT-4o
   on Vietnamese news summarization (via evaluation mode + `model_comparison_results` table)
3. **Hybrid cost/quality tradeoff** — free HF models for short/medium articles,
   paid GPT-4o only when necessary → tracked in `estimated_cost_usd`
4. **BERTScore-based output fusion** — existing PhoBERT microservice repurposed
   as the quality judge in multi-model selection
