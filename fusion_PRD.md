# PRD: Mixture-of-Agents (MoA) Output Fusion for Vietnamese News Summarization

**Project:** Fiber — Browser Extension + Backend for Vietnamese News AI  
**Branch:** `output-fusion`  
**Based on:** [Mixture-of-Agents Enhances Large Language Model Capabilities](https://arxiv.org/abs/2406.04692) (Wang et al., 2024)  
**Status:** Ready for Implementation

---

## 1. Problem Statement

Fiber currently operates in three summarization modes:

| Mode | Behavior |
|------|----------|
| **Forced** | Single model produces one summary |
| **Auto** | Complexity-based routing selects one model |
| **Evaluation** | All models run in parallel; best summary is **selected** by BERTScore |

Even in Evaluation mode, the system is a **ranker** — it picks the single best draft. It never combines the strengths of multiple models. The research shows that LLMs exhibit **collaborativeness**: they produce higher-quality responses when given access to outputs from other models, even weaker ones. A true synthesis step is missing.

## 2. Proposed Solution — MoA Output Fusion

Implement a new **`fusion`** routing mode based on the Mixture-of-Agents (MoA) methodology. Instead of selecting the best draft, an aggregator LLM synthesizes all proposer drafts into a single superior summary grounded in the original article.

### 2.1 Architecture (2-Layer MoA)

```
                        Layer 1: Proposers (parallel)                    Layer 2: Aggregator
                        ────────────────────────────                    ───────────────────

[Original Article] ──┬──> [Model A: e.g. GPT-4o-mini]  ──> Draft_A ──┐
                     │                                                 │
                     ├──> [Model B: e.g. Gemini Flash]  ──> Draft_B ──┤
                     │                                                 ├──> [Aggregator: e.g. GPT-4o]
                     └──> [Model C: e.g. Claude Haiku]  ──> Draft_C ──┤        │
                                                                       │        ▼
                                                          [Original] ──┘   [FUSED SUMMARY]
```

This maps directly to the paper's framework (Section 2.2, Equation 1):
- **Layer 1 agents** (A₁,₁ ... A₁,ₙ) = Proposer models generating independent drafts
- **Layer 2 agent** (A₂,₁) = Single aggregator that receives all Layer 1 outputs + original article
- We use **2 layers** (equivalent to MoA-Lite in the paper) to balance quality vs. latency/cost for a real-time browser extension use case

### 2.2 Why 2 Layers, Not 3+

The paper shows MoA-Lite (2 layers) already outperforms GPT-4o on AlpacaEval 2.0 by 1.8%. Adding more layers gives diminishing returns while multiplying latency. For a browser extension where users expect results in seconds, 2 layers is the optimal trade-off.

### 2.3 Proposer & Aggregator Roles (from paper Section 2.1)

| Role | Criteria | Our Implementation |
|------|----------|--------------------|
| **Proposer** | Generates diverse, useful reference drafts. Doesn't need to be the best model — diversity matters more than individual quality. | **User-selectable** from all models in `model_configurations` table. Heterogeneous providers maximize diversity (paper Section 3.3). |
| **Aggregator** | Synthesizes multiple inputs into a single high-quality output. Must maintain quality even when integrating lower-quality inputs. | **User-selectable** — defaults to the most capable available model (e.g. GPT-4o). Must support structured output. |

### 2.4 Model Catalog & Per-Layer Selection

Users choose which models participate in **each layer independently**. The full model catalog includes both commercial API models and Vietnamese-specialized models:

| Model | Provider | Type | Status | Can be Proposer? | Can be Aggregator? | Notes |
|-------|----------|------|--------|-------------------|--------------------|-------|
| GPT-4o | OpenAI | standard | **Available** | Yes | Yes (recommended) | Best aggregator candidate |
| GPT-4o-mini | OpenAI | standard | **Available** | Yes (recommended) | Yes | Cost-effective proposer |
| o4-mini | OpenAI | reasoning | **Available** | Yes | No | No structured output (reasoning model) |
| Gemini 2.0 Flash | Google | standard | **Available** | Yes (recommended) | Yes | Fast, cheap proposer |
| Gemini 2.5 Pro | Google | standard | **Available** | Yes | Yes | Strong aggregator alternative |
| Claude 3.5 Haiku | Anthropic | standard | **Available** | Yes (recommended) | Yes | Fast, diverse perspective |
| Claude 3.5 Sonnet | Anthropic | standard | **Available** | Yes | Yes | Strong aggregator alternative |
| ViT5-large (VN News) | HuggingFace | base | **Available** | Yes | No | Vietnamese-specialized extractive; no structured output — proposer only |
| PhoGPT-4B-Chat | HuggingFace | chat | **Not deployed** | Disabled | Disabled | Blocked on ZeroGPU (HF Pro). Button visible but disabled with tooltip. |
| Vistral | HuggingFace | chat | **Not implemented** | Disabled | Disabled | Future Vietnamese LLM. Button visible but disabled with tooltip. |

**Selection rules:**
- **Proposer eligibility:** Any model in the catalog. Vietnamese-specialized models (ViT5) add diversity even without structured output — their raw text output is still usable as a draft.
- **Aggregator eligibility:** Must support structured output (`supports_structured_output = true`). This excludes ViT5, reasoning models, and undeployed models.
- **Disabled models:** PhoGPT and Vistral appear in the UI with a disabled state and tooltip explaining why (e.g. "Requires HuggingFace Pro deployment"). This signals to thesis reviewers that the architecture supports them.
- **Minimum proposers:** 2 (to ensure meaningful synthesis)
- **Maximum proposers:** 5 (to cap cost/latency)

### 2.5 Aggregate-and-Synthesize Prompt

Adapted from the paper's Table 1, localized for Vietnamese news summarization:

```
SYSTEM: You are a senior Vietnamese news editor. You will receive the original article 
and multiple summary drafts from different AI models.

Your task:
1. Treat the ORIGINAL ARTICLE as the single source of truth. Never include information 
   not present in the original.
2. Analyze each draft for: superior phrasing, coverage of key points, factual accuracy, 
   and natural Vietnamese expression.
3. Synthesize the best elements from all drafts into ONE final summary.
4. Discard any information from drafts that contradicts or is absent from the original.

Output format: A JSON object with { summary, category, readingTime } — same schema as 
individual summaries.

ORIGINAL ARTICLE:
{article_text}

DRAFT SUMMARIES:
1. [{model_a_name}]: {draft_a}
2. [{model_b_name}]: {draft_b}
...
n. [{model_n_name}]: {draft_n}
```

## 3. Feature Scope

### 3.1 Backend — `output-fusion/` Module

All new MoA logic lives in **`backend/output-fusion/`**, inside the backend package so it can resolve `@/` path aliases (e.g. `@/domain/types`, `@/services/...`) without extra tsconfig changes. It imports from backend services but does not modify them.

```
backend/output-fusion/
├── moa.service.ts          # Core MoA orchestration (proposer dispatch + aggregator call)
├── moa.prompt.ts           # Aggregate-and-synthesize prompt template
├── moa.types.ts            # MoA-specific types (MoAConfig, MoALayerResult, MoAFusionResult)
├── moa.evaluation.ts       # Score fused output vs. individual drafts using existing metrics
└── moa.config.ts           # Default proposer/aggregator selection, timeouts, fallback rules
```

**Core flow of `moa.service.ts`:**

1. **Receive** article text + list of proposer ModelConfigs + aggregator ModelConfig
2. **Layer 1 — Propose:** Call all proposers in parallel via `Promise.allSettled()`. Each uses existing `performSummarize()`. Hard timeout per proposer (configurable, default 15s).
3. **Partial failure handling:** If some proposers fail, proceed with successful drafts (minimum 2 required). If <2 succeed, fall back to single-model forced mode.
4. **Layer 2 — Aggregate:** Build the synthesis prompt from original article + all successful drafts. Call aggregator via `generateJsonCompletion<SummaryData>({ prompt, schema: SummaryDataSchema, provider, model, ... }, fallbackSummary)` — note the options-object signature, not positional args.
5. **Evaluate:** Score the fused summary against the original article using existing metrics (ROUGE-1/2/L, BLEU, BERTScore). Also score each individual draft for comparison.
6. **Return** `MoAFusionResult` containing: fused summary, per-draft scores, fused scores, cost/latency breakdown, model pipeline trace.

### 3.2 Backend Integration

Integrate the `backend/output-fusion/` module into the existing backend:

| Change | File | Description |
|--------|------|-------------|
| Add `'fusion'` to routing_mode | `backend/domain/schemas.ts` | Extend the Zod enum: `'auto' \| 'evaluation' \| 'forced' \| 'fusion'` |
| Add MoA types | `backend/domain/types.ts` | Add `MoAFusionResult`, `MoALayerResult`, `MoADraftResult` |
| New route handler branch | `backend/app/api/summarize/route.ts` | When `routing_mode === 'fusion'`, call `runMoAFusion()` instead of existing flows |
| Persist fusion results | Supabase migration | New `moa_fusion_results` table to store fusion metadata, draft scores, fused scores |
| SSE streaming support | `backend/app/api/summarize/route.ts` | Stream Layer 1 progress events (`proposer-started`, `proposer-done`, `aggregating`, `fused-done`) so the extension can show real-time pipeline progress |

### 3.3 Frontend — Extension Settings Page

Create a new **options page** (`extension/options.tsx` — Plasmo convention) or settings tab within the existing popup:

- **Mode selector:** Radio group with 4 options: `Forced` / `Auto` / `Evaluation` / `Fusion`
- When **Fusion** is selected, show a **two-panel model selector**:

  **Layer 1 — Proposers (multi-select checklist):**
  - Lists ALL models from the catalog (Section 2.4), grouped by provider
  - Each item shows: model display name, provider icon/badge, cost-per-1M indicator
  - **Available models:** Checkbox enabled, selectable
  - **Unavailable models** (PhoGPT, Vistral): Checkbox visible but **disabled** with a tooltip: _"Not yet deployed — requires HuggingFace Pro"_ or _"Coming soon"_
  - Validation: minimum 2 selected, maximum 5
  - Default pre-selection: GPT-4o-mini, Gemini Flash, Claude Haiku (diverse + cheap)

  **Layer 2 — Aggregator (single-select dropdown):**
  - Lists only models where `supports_structured_output = true`
  - **Unavailable models** shown as disabled options with reason tooltip
  - ViT5 excluded (no structured output)
  - Default: GPT-4o (most capable aggregator)

  **Timeout setting:** Slider for per-proposer timeout (5–30s, default 15s)

- Settings persisted to `chrome.storage.local`

### 3.4 Frontend — Debug Page Fusion Section

Add a **"Fusion Pipeline"** section to the debug page (or create debug page if it doesn't exist):

| UI Element | Data Source | Description |
|------------|-------------|-------------|
| **Pipeline Diagram** | SSE events | Visual flow: shows each proposer model as a node, arrows into aggregator, status badges (pending/done/failed) |
| **Draft Comparison Table** | `MoAFusionResult.drafts[]` | Table with columns: Model, Draft Preview (truncated), ROUGE-1, ROUGE-L, BLEU, BERTScore, Latency, Cost |
| **Fused vs. Best Single** | `MoAFusionResult` | Side-by-side comparison: Fused summary scores vs. best individual draft scores. Highlight deltas (green = improvement, red = regression) |
| **Cost & Latency Breakdown** | `MoAFusionResult` | Total cost = Σ(proposer costs) + aggregator cost. Total latency = max(proposer latencies) + aggregator latency. Show as stacked bar chart. |
| **Aggregator Prompt Preview** | Debug mode only | Collapsible section showing the exact prompt sent to the aggregator |

### 3.5 Metrics & Evaluation (Thesis Requirements)

For the thesis, the system must produce data answering: **"Does MoA fusion produce better summaries than the best single model?"**

| Metric | Single Model | Fusion | How Measured |
|--------|-------------|--------|--------------|
| ROUGE-1/2/L | Per-model score | Fused output score | Existing `calculateLexicalMetrics()` |
| BLEU | Per-model score | Fused output score | Existing `calculateLexicalMetrics()` |
| BERTScore | Per-model score | Fused output score | Existing `calculateBertScore()` |
| Compression Rate | Per-model | Fused output | Existing `calculateCompressionRate()` |
| Latency | Per-model | Total pipeline time | `performance.now()` timestamps |
| Cost | Per-model | Total pipeline cost | Token counts × per-model rates |

All metrics saved to `evaluation_metrics` table with `mode = 'fusion'` for filtering.

## 4. Fallback & Error Handling

| Scenario | Behavior |
|----------|----------|
| All proposers fail | Fall back to forced mode with aggregator model |
| <2 proposers succeed | Fall back to forced mode with aggregator model |
| Aggregator fails | Return best individual draft (same as evaluation mode behavior) |
| Aggregator hallucinates (adds info not in original) | Mitigated by prompt design; not runtime-detectable |
| BERTScore service unavailable | Use ROUGE-1 as fallback scoring (existing behavior) |
| Total pipeline >30s | Return partial result with warning flag |

## 5. Cost & Latency Model

**Example with 3 proposers + 1 aggregator (1500-token article):**

| Component | Input Tokens | Output Tokens | Estimated Cost | Latency |
|-----------|-------------|---------------|----------------|---------|
| Proposer 1 (GPT-4o-mini) | ~1,800 | ~300 | ~$0.0004 | ~3s |
| Proposer 2 (Gemini Flash) | ~1,800 | ~300 | ~$0.0002 | ~2s |
| Proposer 3 (Claude Haiku) | ~1,800 | ~300 | ~$0.0003 | ~2s |
| Aggregator (GPT-4o) | ~3,500 | ~400 | ~$0.015 | ~5s |
| **Total** | | | **~$0.016** | **~8s** (3s parallel + 5s aggregator) |

vs. single GPT-4o: ~$0.005, ~5s. **Trade-off: ~3x cost, ~1.6x latency for measurably better quality.**

## 6. Out of Scope

- More than 2 MoA layers (diminishing returns for real-time use)
- Fine-tuning proposer/aggregator models
- Automatic proposer selection based on collaborativeness scoring (paper Section 3.3) — use manual selection for thesis simplicity
- PhoGPT integration as proposer (blocked on HF Pro/ZeroGPU — existing known constraint)

## 7. Success Criteria

1. Fusion mode produces summaries that score higher on at least 2 of 4 metrics (ROUGE-L, BLEU, BERTScore, compression) compared to the best single-model draft, across a test set of 20+ articles from the supported news sites. **Note:** ROUGE/BLEU are computed against the original article (not a human-written reference summary), consistent with the existing evaluation pipeline. These scores measure content coverage rather than classical summarization quality — the thesis should acknowledge this methodology explicitly.
2. Total fusion pipeline latency <15s for typical articles (1000–2000 tokens).
3. Debug page clearly shows the fusion pipeline, per-model scores, and fused vs. single comparison.
4. Graceful degradation: if fusion fails, user still gets a summary via fallback.
