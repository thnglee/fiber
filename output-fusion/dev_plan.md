# Output Fusion — Development Plan

**Branch:** `output-fusion`  
**PRD:** `fusion_PRD.md`  
**Research:** [MoA (arXiv:2406.04692)](https://arxiv.org/abs/2406.04692)

This plan is designed so Claude Code can execute it phase by phase. Each phase is self-contained with specific files to create/modify, exact logic to implement, and verification steps.

---

## Phase 1: Core MoA Module (`backend/output-fusion/`)

**Goal:** Build the standalone MoA orchestration module that can be tested independently. All files live inside `backend/output-fusion/` so `@/` path aliases resolve correctly via `backend/tsconfig.json`.

### 1.1 Create `backend/output-fusion/moa.types.ts`

Define all MoA-specific TypeScript types:

```typescript
// Types to define:

interface MoAConfig {
  proposers: ModelConfig[]        // User-selected models for Layer 1 (2–5 models)
  aggregator: ModelConfig         // User-selected model for Layer 2 (must support structured output)
  proposerTimeoutMs: number       // Per-proposer timeout (default 15000)
  minSuccessfulDrafts: number     // Minimum drafts needed to proceed (default 2)
  includeEvaluation: boolean      // Whether to score fused vs drafts (default true)
}

// Model availability (for frontend model selector)
interface ModelAvailability {
  model_name: string
  display_name: string
  provider: string
  is_available: boolean           // Can be called right now?
  unavailable_reason?: string     // e.g. "Requires HuggingFace Pro deployment"
  can_be_proposer: boolean        // true if available (all available models can propose)
  can_be_aggregator: boolean      // true only if supports_structured_output
}

interface MoADraftResult {
  model_name: string
  provider: string
  summary: string
  category: string
  readingTime: number
  latency_ms: number
  prompt_tokens: number | null
  completion_tokens: number | null
  estimated_cost_usd: number | null
  status: 'success' | 'failed' | 'timeout'
  error?: string
}

interface MoAScores {
  rouge1: number | null
  rouge2: number | null
  rougeL: number | null
  bleu: number | null
  bert_score: number | null
  compression_rate: number | null
}

interface MoAScoredDraft extends MoADraftResult {
  scores: MoAScores
}

interface MoAFusionResult {
  // The fused summary
  fused: {
    summary: string
    category: string
    readingTime: number
    scores: MoAScores
  }
  // Individual draft details
  drafts: MoAScoredDraft[]
  // Aggregator metadata
  aggregator: {
    model_name: string
    provider: string
    latency_ms: number
    prompt_tokens: number | null
    completion_tokens: number | null
    estimated_cost_usd: number | null
  }
  // Pipeline totals
  pipeline: {
    total_latency_ms: number         // max(proposer latencies) + aggregator latency
    total_cost_usd: number | null
    total_tokens: number | null
    proposer_count: number
    successful_proposers: number
    failed_proposers: string[]       // model names that failed
  }
  // For persistence
  routing_id?: string
}
```

**Import from:** `@/domain/types` for `ModelConfig`.

### 1.2 Create `backend/output-fusion/moa.prompt.ts`

Build the aggregator prompt template:

```typescript
export function buildAggregatorPrompt(
  originalArticle: string,
  drafts: Array<{ model_name: string; summary: string }>
): string
```

**Prompt content** (Vietnamese-optimized, from PRD Section 2.4):
- System role: Senior Vietnamese news editor
- Include the original article as ground truth
- List all drafts with their model names
- Instruct: synthesize best elements, discard contradictions, output same JSON schema as individual summaries
- The prompt must work with `generateJsonCompletion<SummaryData>()` — so the output schema is the existing `SummaryDataSchema`

### 1.3 Create `backend/output-fusion/moa.config.ts`

Default configuration:

```typescript
export const MOA_DEFAULTS = {
  PROPOSER_TIMEOUT_MS: 15_000,
  MIN_SUCCESSFUL_DRAFTS: 2,
  MAX_PROPOSERS: 5,                // Cap to control cost
  INCLUDE_EVALUATION: true,
}
```

Also export helpers:

```typescript
// Build config from user selections (frontend sends model_name arrays)
export async function buildMoAConfig(
  userSelection?: {
    proposerModels?: string[]      // model_name values chosen by user
    aggregatorModel?: string       // model_name value chosen by user
    timeoutMs?: number
  }
): Promise<MoAConfig>
```

This function:
1. Calls `getAllModelConfigs()` from `backend/services/model-config.service.ts`
2. If `userSelection.proposerModels` provided: filter to those specific models, validate they exist and are available
3. If not provided: auto-select — pick diverse models across providers (prefer GPT-4o-mini, Gemini Flash, Claude Haiku)
4. If `userSelection.aggregatorModel` provided: use that model, validate it supports structured output
5. If not provided: auto-select most capable aggregator (prefer GPT-4o → Claude Sonnet → Gemini Pro)
6. Apply timeout override if provided

```typescript
// Get model availability for frontend model selector
export async function getModelAvailability(): Promise<ModelAvailability[]>
```

This function:
1. Calls `getAllModelConfigs()`
2. For each model, determines:
   - `is_available`: API models are available if provider key is set; HuggingFace models check their service URL env var (ViT5 always available via HF Inference API; PhoGPT requires `PHOGPT_SERVICE_URL`)
   - `can_be_proposer`: true if `is_available`
   - `can_be_aggregator`: true if `is_available` AND `supports_structured_output`
   - `unavailable_reason`: human-readable string for disabled UI elements
3. Includes placeholder entries for **not-yet-implemented models** (Vistral) so they appear in the UI as disabled

### 1.4 Create `backend/output-fusion/moa.evaluation.ts`

Scoring utilities:

```typescript
export async function scoreSummary(
  summary: string,
  originalArticle: string
): Promise<MoAScores>
```

This function:
1. Calls `calculateLexicalMetrics(summary, originalArticle)` for ROUGE-1/2/L, BLEU
2. Calls `calculateBertScore(originalArticle, summary)` for BERTScore (try/catch, null on failure)
3. Calculates compression rate: `summary.length / originalArticle.length`
4. Returns `MoAScores` object

**Note on methodology:** ROUGE/BLEU are computed against the original article text (not a human-written reference summary), consistent with the existing evaluation pipeline. This measures content coverage rather than classical summarization quality. BERTScore is the most meaningful metric here as it captures semantic similarity regardless of length difference. The thesis should state this methodology explicitly.

Also:

```typescript
export function compareFusedVsDrafts(
  fusedScores: MoAScores,
  draftScores: MoAScoredDraft[]
): { metric: string; fused: number; bestSingle: number; delta: number; improved: boolean }[]
```

### 1.5 Create `backend/output-fusion/moa.service.ts`

**This is the core file.** Main export:

```typescript
export async function runMoAFusion(
  articleText: string,
  website: string | undefined,
  config: MoAConfig
): Promise<MoAFusionResult>
```

**Implementation steps:**

1. **Log start** via `logger.addLog('moa-fusion', 'start', { ... })`

2. **Layer 1 — Proposers (parallel):**
   ```typescript
   const proposerPromises = config.proposers.map(model =>
     withTimeout(
       performSummarize({ content: articleText, url: website }, model),
       config.proposerTimeoutMs
     )
   )
   const results = await Promise.allSettled(proposerPromises)
   ```
   - Use a `withTimeout()` helper that wraps a promise with `Promise.race` against a timeout rejection
   - `performSummarize()` returns `SummarizeResponse` (with `summary`, `category`, `readingTime`, `model`, `usage`, etc.) — map each successful result to `MoADraftResult`:
     ```typescript
     const draft: MoADraftResult = {
       model_name: model.model_name,
       provider: model.provider,
       summary: response.summary,
       category: response.category,
       readingTime: response.readingTime,
       latency_ms: latencyMs,
       prompt_tokens: response.usage?.prompt_tokens ?? null,
       completion_tokens: response.usage?.completion_tokens ?? null,
       estimated_cost_usd: computeCost(model, response.usage),
       status: 'success',
     }
     ```
   - Track failed models for the pipeline report

3. **Check minimum drafts:**
   - If `successfulDrafts.length < config.minSuccessfulDrafts`, throw `MoAInsufficientDraftsError`
   - Caller (API route) catches this and falls back to forced mode

4. **Layer 2 — Aggregator:**
   - Build prompt via `buildAggregatorPrompt(articleText, successfulDrafts)`
   - Call the aggregator using the actual `generateJsonCompletion` signature (options object + fallback):
     ```typescript
     const aggregatorResult = await generateJsonCompletion<SummaryData>(
       {
         prompt: aggregatorPrompt,
         schema: SummaryDataSchema,
         provider: config.aggregator.provider,
         model: config.aggregator.model_name,
         temperature: config.aggregator.temperature,
         logContext: 'moa-aggregator',
       },
       fallbackSummary  // best individual draft as fallback
     )
     ```
   - Record latency, tokens, cost from `aggregatorResult.usage`

5. **Evaluate (if `config.includeEvaluation`):**
   - Score fused summary via `scoreSummary(fusedSummary, articleText)`
   - Score each draft via `scoreSummary(draft.summary, articleText)` (parallel)
   - Attach scores to result

6. **Build and return `MoAFusionResult`**

### 1.6 Verification

- Unit-testable by mocking `performSummarize` and `generateJsonCompletion`
- Create `backend/output-fusion/__tests__/moa.service.test.ts` with cases:
  - Happy path: 3 proposers succeed, aggregator synthesizes
  - Partial failure: 1 proposer times out, proceeds with 2
  - Total failure: all proposers fail, throws error
  - Aggregator failure: throws error (caught by caller)

---

## Phase 2: Backend Integration

**Goal:** Wire MoA into the existing API so `routing_mode: 'fusion'` triggers the MoA pipeline.

### 2.1 Update Domain Schemas

**File:** `backend/domain/schemas.ts`

- Add `'fusion'` to the `routing_mode` Zod enum:
  ```typescript
  routing_mode: z.enum(['auto', 'evaluation', 'forced', 'fusion']).optional()
  ```
- Add optional `fusion_config` to `SummarizeRequestSchema`:
  ```typescript
  fusion_config: z.object({
    proposerModels: z.array(z.string()).min(2).max(5).optional(),
    aggregatorModel: z.string().optional(),
    timeoutMs: z.number().min(5000).max(30000).optional(),
  }).optional()
  ```

**File:** `backend/domain/types.ts`

- Add `'fusion'` to `RoutingDecision.routing_mode` type
- Export `MoAFusionResult`, `ModelAvailability` types (re-export from `@/output-fusion/moa.types`)

### 2.1b Create Model Availability Endpoint

**File:** `backend/app/api/models/availability/route.ts`

New `GET` endpoint that returns `ModelAvailability[]` for the frontend settings page:

```typescript
export async function GET() {
  const availability = await getModelAvailability()  // from @/output-fusion/moa.config
  return NextResponse.json(availability)
}
```

This powers the per-layer model selector UI — the frontend uses `can_be_proposer` and `can_be_aggregator` to enable/disable checkboxes and dropdown options, and shows `unavailable_reason` as tooltip text for disabled models.

### 2.2 Update Summarize API Route

**File:** `backend/app/api/summarize/route.ts`

Add a new branch in the POST handler. The request body may include user-selected models:

```typescript
// Request body now supports:
// { routing_mode: 'fusion', fusion_config?: { proposerModels?: string[], aggregatorModel?: string, timeoutMs?: number } }

if (routing_mode === 'fusion') {
  // 1. Build MoA config from user selections (or auto-select if not provided)
  const moaConfig = await buildMoAConfig(body.fusion_config)

  // 2. Run MoA fusion
  try {
    const fusionResult = await runMoAFusion(articleText, website, moaConfig)

    // 3. Save evaluation metrics with mode='fusion'
    waitUntil(
      saveEvaluationMetrics({
        ...fusionResult.fused.scores,
        mode: 'fusion',
        model: `moa:${fusionResult.aggregator.model_name}`,
        url: website,
        // ... other fields
      })
    )

    // 4. Return response matching SummarizeResponseSchema
    return NextResponse.json({
      summary: fusionResult.fused.summary,
      category: fusionResult.fused.category,
      readingTime: fusionResult.fused.readingTime,
      model: `moa:${fusionResult.aggregator.model_name}`,
      routing: { mode: 'fusion' },
      fusion: fusionResult,  // Full pipeline data for debug page
    })
  } catch (err) {
    // Fallback to forced mode
    if (err instanceof MoAInsufficientDraftsError) {
      // ... fall through to forced mode logic
    }
    throw err
  }
}
```

### 2.3 SSE Streaming for Fusion Pipeline

**File:** `backend/app/api/summarize/route.ts` (streaming branch)

When `routing_mode === 'fusion'` and `stream === true`:

Send SSE events for each pipeline stage:
```
{ type: 'fusion-start', data: { proposers: [...modelNames], aggregator: modelName } }
{ type: 'proposer-done', data: { model: 'gpt-4o-mini', latency_ms: 2100, status: 'success' } }
{ type: 'proposer-done', data: { model: 'gemini-flash', latency_ms: 1800, status: 'success' } }
{ type: 'proposer-done', data: { model: 'claude-haiku', latency_ms: null, status: 'timeout' } }
{ type: 'aggregating', data: { draftCount: 2 } }
{ type: 'summary-delta', data: { content: '...' } }  // Aggregator streaming output
{ type: 'fusion-done', data: { fusionResult: MoAFusionResult } }
```

This requires modifying `moa.service.ts` to accept a callback/emitter for progress events:

```typescript
export async function runMoAFusionStreaming(
  articleText: string,
  website: string | undefined,
  config: MoAConfig,
  onEvent: (event: MoAStreamEvent) => void
): AsyncGenerator<...>
```

### 2.4 Supabase Migration

**File:** `backend/supabase/migrations/YYYYMMDD_moa_fusion_results.sql`

```sql
CREATE TABLE moa_fusion_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  routing_id UUID REFERENCES routing_decisions(id) ON DELETE SET NULL,

  -- Fused output
  fused_summary TEXT NOT NULL,
  fused_category TEXT,
  fused_reading_time INTEGER,

  -- Fused scores
  fused_rouge1 REAL,
  fused_rouge2 REAL,
  fused_rougeL REAL,
  fused_bleu REAL,
  fused_bert_score REAL,
  fused_compression_rate REAL,

  -- Aggregator metadata
  aggregator_model TEXT NOT NULL,
  aggregator_provider TEXT NOT NULL,
  aggregator_latency_ms INTEGER,
  aggregator_prompt_tokens INTEGER,
  aggregator_completion_tokens INTEGER,
  aggregator_cost_usd REAL,

  -- Pipeline metadata
  total_latency_ms INTEGER,
  total_cost_usd REAL,
  proposer_count INTEGER,
  successful_proposers INTEGER,
  failed_proposers TEXT[],  -- Array of model names

  article_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Per-draft results (child table)
CREATE TABLE moa_draft_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fusion_id UUID REFERENCES moa_fusion_results(id) ON DELETE CASCADE,
  model_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL,  -- 'success' | 'failed' | 'timeout'
  error TEXT,

  -- Scores
  rouge1 REAL,
  rouge2 REAL,
  rougeL REAL,
  bleu REAL,
  bert_score REAL,
  compression_rate REAL,

  -- Metadata
  latency_ms INTEGER,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  estimated_cost_usd REAL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_moa_fusion_created ON moa_fusion_results(created_at DESC);
CREATE INDEX idx_moa_drafts_fusion ON moa_draft_results(fusion_id);
```

### 2.5 Update `evaluation_metrics` Table

Add a row with `mode = 'fusion'` for each fusion run so it appears alongside single-model metrics on the existing metrics page. No schema change needed — just use the existing columns with the new mode value.

### 2.6 Verification

```bash
# Test with curl
curl -X POST http://localhost:3000/api/summarize \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://tuoitre.vn/...", "routing_mode": "fusion"}'

# Verify: response includes fusion.drafts[], fusion.fused, fusion.pipeline
# Verify: moa_fusion_results and moa_draft_results tables populated
# Verify: evaluation_metrics has a row with mode='fusion'
```

---

## Phase 3: Frontend — Settings Page

**Goal:** Let users select Fusion mode and configure proposer/aggregator models.

### 3.1 Create Options/Settings Page

**File:** `extension/options.tsx` (Plasmo options page convention)

Or alternatively, add a settings panel within the existing popup. Decision depends on Plasmo convention in this project — check if `options.tsx` is supported by the current Plasmo setup.

**UI Components:**

1. **Mode Selector** — Radio group:
   - `Forced` — Single model (default)
   - `Auto` — Complexity-based routing
   - `Evaluation` — Run all, pick best
   - `Fusion (MoA)` — Run all, synthesize (NEW)

2. **Fusion Settings** (visible only when Fusion is selected) — **Two-panel model selector**:

   **Panel A: Layer 1 — Proposers (multi-select checklist)**
   - Fetch all models from `GET /api/models` (backed by `getAllModelConfigs()`)
   - Group models by provider (OpenAI, Google, Anthropic, HuggingFace)
   - Each item renders: `[checkbox] [provider icon] Model Display Name — $X.XX/1M tokens`
   - **Available models** (`is_deployed !== false`): checkbox enabled, user can toggle
   - **Unavailable models** (PhoGPT, Vistral — not yet deployed): checkbox **disabled**, greyed out, with tooltip: _"Not yet deployed — requires HuggingFace Pro"_ or _"Coming soon"_. These still appear in the list to show thesis reviewers the architecture supports them.
   - ViT5: **enabled** — it works as a proposer even without structured output (raw text draft is fine)
   - Validation: minimum 2 selected, maximum 5. Show inline validation message.
   - Default pre-selection: `gpt-4o-mini`, `gemini-2.0-flash-001`, `claude-3-5-haiku-latest`

   **Panel B: Layer 2 — Aggregator (single-select dropdown)**
   - Filter to models where `supports_structured_output = true` (aggregator must produce structured JSON)
   - ViT5, reasoning models (o4-mini, o3-mini): excluded from dropdown
   - Unavailable models (PhoGPT, Vistral): shown as **disabled options** with reason text
   - Default: `gpt-4o` (most capable aggregator)
   - A model CAN appear in both proposer and aggregator lists — the paper explicitly allows model reuse across layers (Section 2.2)

   **Timeout Slider**
   - Range: 5s–30s, step 1s, default 15s
   - Label dynamically shows current value: "Per-proposer timeout: 15s"

3. **Model Availability Logic** — Uses the `ModelAvailability` type already defined in `backend/output-fusion/moa.types.ts` (Phase 1.1). The frontend fetches availability from `GET /api/models/availability` (Phase 2.1b) and uses `can_be_proposer` / `can_be_aggregator` to enable/disable checkboxes, and `unavailable_reason` as tooltip text for disabled models. Do **not** redefine this type in frontend code — import or mirror the shape from the API response.

4. **Persistence** — All settings saved to `chrome.storage.local` under key `fiberSettings`:
   ```typescript
   interface FiberSettings {
     routingMode: 'forced' | 'auto' | 'evaluation' | 'fusion'
     fusion?: {
       proposerModels: string[]      // model_name values (Layer 1)
       aggregatorModel: string       // model_name value (Layer 2)
       timeoutMs: number
     }
   }
   ```

5. **Loading/Saving** — Settings loaded on page open. Saved on change (debounced). Toast notification on save.

### 3.2 Update Extension API Calls

**File:** `extension/contents/summary-sidebar.tsx` (or wherever the summarize API is called)

When triggering summarization:
1. Read settings from `chrome.storage.local`
2. Include `routing_mode: settings.routingMode` in the API request body
3. If fusion mode, also include `fusion_config: settings.fusion` in the request body (backend uses this to override defaults)

### 3.3 Verification

- Select Fusion mode, pick 3 proposers and 1 aggregator
- Navigate to a supported news site
- Trigger summarization
- Verify the request includes `routing_mode: 'fusion'`
- Verify summary appears in sidebar

---

## Phase 4: Frontend — Debug Page Fusion Section

**Goal:** Show the full MoA pipeline trace and quality comparison.

### 4.1 Create Debug Page

**File:** `extension/tabs/debug.tsx` (Plasmo tabs page) or `extension/devtools.tsx`

The debug page should be accessible via the extension popup ("Debug" button) or as a browser tab.

### 4.2 Fusion Pipeline Section

**Only visible when the last summarization used fusion mode.** Data comes from the `fusion` field in the API response (stored in extension state).

**Sub-sections:**

#### A. Pipeline Visualization

A horizontal flow diagram:

```
[Article] → [GPT-4o-mini ✅ 2.1s] ──┐
            [Gemini Flash ✅ 1.8s] ──┼──→ [GPT-4o Aggregator ✅ 4.2s] → [Fused Summary]
            [Claude Haiku ❌ timeout]─┘
```

Implementation: Simple React component with flexbox/grid. Each node is a card with:
- Model name
- Status icon (✅/❌/⏳)
- Latency
- Color-coded by status

#### B. Draft Comparison Table

| Model | ROUGE-1 | ROUGE-L | BLEU | BERTScore | Latency | Cost |
|-------|---------|---------|------|-----------|---------|------|
| GPT-4o-mini | 0.42 | 0.38 | 0.31 | 0.78 | 2.1s | $0.0004 |
| Gemini Flash | 0.45 | 0.40 | 0.33 | 0.80 | 1.8s | $0.0002 |
| **Fused (MoA)** | **0.51** | **0.46** | **0.38** | **0.85** | **6.0s** | **$0.016** |

- Fused row highlighted
- Delta indicators: green ↑ / red ↓ vs. best single draft
- Sortable columns

#### C. Score Comparison Chart

Bar chart (use a lightweight lib like `recharts` if already in deps, or simple CSS bars):
- Group by metric (ROUGE-1, ROUGE-L, BLEU, BERTScore)
- Each group has bars for: each draft model + fused
- Fused bar in distinct color

#### D. Cost & Latency Breakdown

Two simple visualizations:
- **Cost:** Stacked bar showing each proposer's cost + aggregator's cost = total
- **Latency:** Timeline showing proposers running in parallel, then aggregator running after

#### E. Aggregator Prompt (Collapsible)

Expandable section showing the exact prompt sent to the aggregator. Useful for thesis documentation.

### 4.3 State Management

Store the last fusion result in extension memory (not persistent — just session state):

```typescript
// In a shared state module or context
let lastFusionResult: MoAFusionResult | null = null

// Set after fusion API response
// Read by debug page
```

Use `chrome.runtime.sendMessage` / `chrome.runtime.onMessage` to pass fusion results from the content script to the debug page if they're in different contexts.

### 4.4 Verification

- Run a fusion summarization
- Open debug page
- Verify: pipeline diagram shows all models with correct statuses
- Verify: comparison table shows all drafts + fused scores
- Verify: fused row shows delta vs. best single draft
- Verify: cost/latency breakdown matches API response data

---

## Phase 5: Testing & Thesis Data Collection

**Goal:** Validate that fusion produces measurably better summaries and collect data for the thesis.

### 5.1 Create Test Script

**File:** `backend/output-fusion/__tests__/moa.integration.test.ts`

- Test with 5+ articles from each supported site (tuoitre.vn, thanhnien.vn, etc.)
- For each article: run single-model summarization AND fusion
- Compare metrics and persist results
- Generate a summary report

### 5.2 Metrics Collection Script

**File:** `backend/output-fusion/scripts/collect-metrics.ts`

A CLI script that:
1. Reads a list of article URLs from a JSON file
2. For each URL: calls `/api/summarize` with `routing_mode: 'forced'` (for each model) and `routing_mode: 'fusion'`
3. Saves all results to a JSON file for thesis analysis
4. Outputs a summary table to stdout

### 5.3 Expected Thesis Outputs

From the collected data, the thesis should present:
- Table: Average metric scores per model vs. fusion across N articles
- Chart: Per-article metric comparison (fusion vs. best single model)
- Analysis: In which cases fusion helps most (long articles? complex topics?)
- Cost-benefit analysis: quality improvement per dollar spent

---

## Implementation Order & Dependencies

```
Phase 1 (Core Module — backend/output-fusion/)
  ├── 1.1 moa.types.ts          (no deps)
  ├── 1.2 moa.prompt.ts         (no deps)
  ├── 1.3 moa.config.ts         (depends on model-config.service)
  ├── 1.4 moa.evaluation.ts     (depends on evaluation.service, bert.service)
  └── 1.5 moa.service.ts        (depends on 1.1–1.4, summarize.service, llm.service)

Phase 2 (Backend Integration)
  ├── 2.1 Schema updates        (no deps)
  ├── 2.2 API route update       (depends on Phase 1)
  ├── 2.3 SSE streaming         (depends on 2.2)
  └── 2.4 Supabase migration    (no deps, can run in parallel)

Phase 3 (Frontend Settings)
  ├── 3.1 Options page          (depends on 2.1 for mode enum)
  └── 3.2 API call updates      (depends on 3.1)

Phase 4 (Frontend Debug)
  ├── 4.1 Debug page scaffold   (no deps)
  ├── 4.2 Fusion section        (depends on 2.2 response shape)
  └── 4.3 State management      (depends on 4.2)

Phase 5 (Testing)
  └── All phases complete
```

**Estimated file count:** ~12 new files, ~5 modified files.

---

## Key Files Reference (Existing)

| File | Why It Matters |
|------|---------------|
| `backend/services/summarize.service.ts` | `performSummarize()` — called by each proposer |
| `backend/services/llm.service.ts` | `generateJsonCompletion()` — called by aggregator |
| `backend/services/evaluation.service.ts` | `calculateLexicalMetrics()`, `saveEvaluationMetrics()` |
| `backend/services/bert.service.ts` | `calculateBertScore()` |
| `backend/services/model-config.service.ts` | `getAllModelConfigs()`, `getActiveModelConfig()` |
| `backend/services/fusion.service.ts` | **Existing ranker** (evaluation mode) — will NOT be modified. MoA is additive, not a replacement. |
| `backend/domain/schemas.ts` | Zod schemas — needs `'fusion'` added to routing_mode |
| `backend/domain/types.ts` | Domain types — needs MoA types added |
| `backend/app/api/summarize/route.ts` | API entry point — needs fusion branch |
| `extension/contents/summary-sidebar.tsx` | Where summarize API is called from extension |
| `extension/popup.tsx` | Extension popup — may need "Settings" / "Debug" links |
