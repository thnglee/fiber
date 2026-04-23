# PRD: LLM-Judge Evaluation Module

**Project:** Fiber — Browser Extension + Backend for Vietnamese News AI
**Branch:** `feature/llm-judge-evaluation`
**Status:** Ready for implementation
**Motivation:** Close the measurement gap exposed by the MoA investigation — our
overlap-based metrics (ROUGE / BLEU / BERTScore) cannot capture the synthesis
quality improvements the MoA paper claims. Adding an LLM-judge gives us a
second, complementary evaluation axis that reports results in the paper's own
framework (AlpacaEval-style pairwise preference, MT-Bench-style absolute
scores, FLASK-style fine-grained rubric).

**Paper alignment:** Every judge style in this PRD maps directly to one of the
three evaluation frameworks used by Wang et al. 2024 (fusion.pdf). See §2.2
and Appendix Table 5 of the paper for the LLM-ranker prompt template.

---

## 1. Problem Statement

Fiber currently evaluates every summary with four overlap-style metrics
computed **against the original article**:

| Metric | What it measures |
|--------|-------------------|
| ROUGE-1 / 2 / L | n-gram / LCS overlap with source |
| BLEU | precision-weighted n-gram overlap with source |
| BERTScore (PhoBERT) | contextual semantic similarity with source |
| Compression rate | summary length as % of source length |

These metrics answer **"is the summary grounded in the source?"** They cannot
answer faithfulness, fluency, coverage of *important* points, or human
preference — the axes the MoA paper's results actually live on. This is why
our three-way batch proved the paper's claims cannot hold under overlap
metrics (see `CLAUDE.md` → "Output Fusion (MoA) — Open Investigation").
Without an LLM-judge we cannot report MoA in the paper's own terms — a
blocker for the thesis defense.

## 2. Proposed Solution — LLM-Judge Module

Add an **LLM-as-judge** evaluation pathway that runs **alongside** (not
instead of) the existing overlap metrics. Users configure a **judge mode** in
the backend Settings page, and the Metrics + Debug pages update accordingly.

The module implements the **three evaluation styles used by the MoA paper**:

### 2.1 Judge styles (from fusion.pdf)

| Style | Paper benchmark | Method | When Fiber uses it |
|-------|-----------------|--------|---------------------|
| **Rubric** | FLASK (Ye et al. 2023) | Score summary on 5 dimensions, 1–5 each | Per-summary display on metrics page |
| **Absolute** | MT-Bench (Zheng et al. 2023) | Single holistic score 1–10 | Quick comparison card on metrics page |
| **Pairwise preference** | AlpacaEval 2.0 LC (Dubois et al. 2024) | "Which of A or B would a human prefer?" with length-controlled debiasing | Fusion: fused vs best-draft; the defense-critical number |
| **N-way ranker** *(optional, ported)* | Paper's Appendix Table 5 | Given N candidates, pick best | Optional — same as LLM-Ranker baseline |

The first three are the headline styles. The N-way ranker is a cheap
add-on — the paper's Appendix Table 5 gives the exact prompt template.

### 2.2 Judge operation mode

| Mode | Behavior |
|------|----------|
| `metrics_only` | Default — current behavior, overlap metrics only. |
| `judge_only` | Skip overlap, run judge only (rubric per summary; pairwise for fusion). |
| `both` | Run both. UI shows both sections, enabling cross-methodology comparison. This is the thesis configuration. |

`judge_mode` is **orthogonal** to `routing_mode` — any routing mode
(`auto` / `evaluation` / `forced` / `fusion`) can have any judge mode.

### 2.3 FLASK-derived rubric (Vietnamese news summarization)

Score 1–5 on each dimension, plus overall 1–5. Dimensions chosen from
FLASK's 12 to match summarization (factuality, completeness, readability,
conciseness) plus one MoA-specific dimension:

| Dimension | Maps to FLASK | What it measures |
|-----------|---------------|-------------------|
| **Faithfulness** | factuality | No hallucinations; every claim supported by source |
| **Coverage** | completeness | Captures the article's key points |
| **Fluency** | readability | Natural Vietnamese, correct grammar |
| **Conciseness** | conciseness | No redundant filler |
| **Overall** | — | Holistic judgment |

Judge returns structured JSON via the existing `generateJsonCompletion`
helper with a Zod schema. Justification is capped at ~80 Vietnamese tokens
per summary to control cost.

### 2.4 Pairwise prompt (AlpacaEval-style, length-controlled)

For fusion: `judgePairwise(fused, bestDraft, source)`. The prompt:
1. Frames the judge as a Vietnamese editorial expert choosing the
   higher-quality summary of a specific article.
2. Presents the source + summary A + summary B (order randomized per call
   to avoid position bias).
3. Requests a JSON verdict: `{ winner: 'A' | 'B' | 'tie', per_dimension:
   {...}, justification: string, length_note: string }`.
4. Explicitly asks the judge **not** to penalize conciseness unless the
   shorter summary is missing critical points — our homemade
   length-control instruction, since we can't use AlpacaEval's LC
   regression debiasing out of the box.

### 2.5 Judge model

Default: **`gpt-4o`** (matches the paper's use of GPT-4 for AlpacaEval /
MT-Bench grading). User-configurable via Settings → any model in
`model_configurations` where `supports_structured_output = true`. Reasoning
models (o3-mini, o4-mini) are eligible; ViT5 and disabled models are
excluded.

## 3. Feature Scope

### 3.1 Backend — services & schemas

```
backend/
├── services/
│   └── llm-judge.service.ts            # NEW — rubric + pairwise + n-way ranker
├── domain/
│   ├── schemas.ts                       # EXTEND — JudgeRubricSchema, JudgePairwiseSchema
│   └── types.ts                         # EXTEND — JudgeResult types
├── supabase/migrations/
│   └── 019_add_llm_judge.sql            # NEW — judge columns + llm_judge_pairwise table
├── app/api/
│   ├── summarize/route.ts               # EXTEND — honour judge_config, run judge
│   ├── evaluate/route.ts                # EXTEND — accept judge_mode override
│   └── settings/
│       └── judge/route.ts               # NEW — GET/PATCH judge config (mirrors settings/routing pattern)
├── output-fusion/
│   └── moa.evaluation.ts                # EXTEND — judgePairwise(fused, bestDraft, source)
└── output-fusion/scripts/
    └── collect-metrics.ts               # EXTEND — --judge-mode, --judge-model, --judge-style
```

**Service signatures (`llm-judge.service.ts`):**

```ts
export async function judgeRubric(
  summary: string,
  sourceArticle: string,
  opts?: JudgeOptions,
): Promise<JudgeRubricResult>

export async function judgeAbsolute(         // MT-Bench style, 1–10
  summary: string,
  sourceArticle: string,
  opts?: JudgeOptions,
): Promise<JudgeAbsoluteResult>

export async function judgePairwise(         // AlpacaEval-style, position-randomized
  a: { label: string; text: string },
  b: { label: string; text: string },
  sourceArticle: string,
  opts?: JudgeOptions,
): Promise<JudgePairwiseResult>

export async function judgeNWayRanker(       // Paper Appendix Table 5
  candidates: Array<{ label: string; text: string }>,
  sourceArticle: string,
  opts?: JudgeOptions,
): Promise<JudgeRankerResult>

interface JudgeOptions {
  model?: ModelConfig            // defaults to system's default judge model
  style?: 'rubric' | 'absolute'  // for single-summary calls
  logContext?: string
}
```

### 3.2 Backend — DB schema

**Added columns on `evaluation_metrics`:**

| Column | Type | Notes |
|--------|------|-------|
| `judge_mode` | text | `metrics_only` \| `judge_only` \| `both` |
| `judge_model` | text | nullable — the judge model name |
| `judge_style` | text | `rubric` \| `absolute` (null if pairwise-only run) |
| `judge_rubric` | jsonb | `{ faithfulness, coverage, fluency, conciseness, overall }` each 1–5 |
| `judge_absolute` | int | 1–10, nullable |
| `judge_justification` | text | nullable |
| `judge_latency_ms` | int | nullable |
| `judge_cost_usd` | numeric(10,6) | nullable |

**New table `llm_judge_pairwise`** — one row per pairwise comparison:

| Column | Type |
|--------|------|
| `id` | uuid PK |
| `routing_id` | uuid FK → `routing_decisions` (nullable — batch runs may not have one) |
| `fusion_id` | uuid FK → `moa_fusion_results` (nullable) |
| `summary_a_label` | text (e.g. `"fused"`) |
| `summary_b_label` | text (e.g. `"best_draft:gpt-4o-mini"`) |
| `winner` | text — `A` \| `B` \| `tie` |
| `per_dimension` | jsonb |
| `justification` | text |
| `length_note` | text |
| `judge_model` | text |
| `judge_cost_usd` | numeric(10,6) |
| `created_at` | timestamptz |

### 3.3 Backend — Settings persistence pattern

Judge config follows the **existing `settings/routing` pattern** (see
`backend/app/api/settings/routing/route.ts` and the `model_configurations`
table):

- New Supabase row in a settings table: `judge_mode`, `default_judge_model`,
  `default_judge_style`.
- New API route `/api/settings/judge` with `GET` + `PATCH` — same shape as
  `/api/settings/routing`.
- Zod schema in the route file enforces allowed values.

This is **server-side** persistence, not `chrome.storage.local`. The
extension does not ship its own judge UI — users configure everything on the
Next.js Settings page at `localhost:3000/settings`.

### 3.4 Settings UI — `backend/app/settings/page.tsx`

Add a new **"Evaluation Judge"** card below the existing "Routing
Configuration" card:

- **Judge mode** radio: `Metrics only` / `LLM-Judge only` / `Both` (default
  `Metrics only`).
- **Default judge style** radio (hidden when mode is `metrics_only`): 
  `Rubric (FLASK-style)` / `Absolute (MT-Bench-style)`. Pairwise is always
  on for fusion runs when judge is enabled.
- **Judge model** dropdown (hidden when mode is `metrics_only`) — filtered
  to `supports_structured_output = true`. Default `gpt-4o`.
- **Cost banner** — appears when mode ≠ `metrics_only`. Shows estimated
  added cost per summary (~$0.006 for GPT-4o rubric, ~$0.008 for pairwise).

Persisted via `PATCH /api/settings/judge`. The page reads on mount via
`GET /api/settings/judge`.

### 3.5 Metrics page UI — `backend/app/metrics/page.tsx`

Current page is 1775 lines with tabs: `evaluation | routing | fusion`.

**Per-row rendering** changes based on the row's own `judge_mode`:

- `metrics_only` rows — unchanged.
- `judge_only` rows — hide ROUGE/BLEU/BERT columns, show a new **Judge
  Score** column (radar chart mini-widget for rubric; single number for
  absolute).
- `both` rows — show both, with a tight visual separator.

**New reusable components** (in `backend/app/metrics/components/` or
inline, following the existing style):

- `JudgeRubricWidget` — 5-axis radar OR compact bar group.
- `JudgePairwiseBadge` — `Fused wins` / `Best-draft wins` / `Tie` with
  tooltip showing per-dimension breakdown.
- `JudgeJustificationPanel` — collapsible text panel.

**Existing tabs** react as follows:
- `evaluation` tab — adds a "Judge" column group when any row in the page
  has judge data.
- `fusion` tab — gains a "Judge Verdict" column showing
  `JudgePairwiseBadge` for each fusion run.

### 3.6 Debug page UI — `backend/app/debug/page.tsx`

Augment the existing fusion debug sections with:
- **Judge Verdict** subsection under "Fused vs Best-Draft" with the
  pairwise badge, per-dimension comparison table, and justification.
- Rendered only when the inspected run has `judge_mode ≠ metrics_only`.

### 3.7 Batch harness — `output-fusion/scripts/collect-metrics.ts`

New flags (backwards-compatible):
- `--judge-mode metrics_only|judge_only|both` — default `metrics_only`.
- `--judge-style rubric|absolute` — default `rubric`.
- `--judge-model <model>` — default `gpt-4o`.

Markdown report gains a new section: **"LLM-Judge Pairwise (Fused vs
Best-Draft)"** with per-dimension win rates and overall preference rate.
JSON output gains a `judge` block on each fusion record.

This is the **primary thesis artefact** — re-running the 50-article batch
with `--judge-mode both` produces the numbers for the defense.

## 4. Data Flow

### 4.1 `metrics_only` (unchanged)
```
summarize → overlap metrics → persist → UI shows metrics card
```

### 4.2 `judge_only`
```
summarize → judgeRubric OR judgeAbsolute → persist → UI shows judge card
```

### 4.3 `both`
```
summarize → Promise.all([overlap, judgeRubric]) → persist everything → UI shows both
```

### 4.4 Fusion mode, any judge mode ≠ metrics_only
```
runMoAFusion → drafts + fused + per-summary judgeRubric (if enabled)
            → judgePairwise(fused, bestDraft, source)
            → persist to moa_fusion_results + llm_judge_pairwise
            → UI renders verdict + per-dimension comparison
```

## 5. Phased Development Plan

| Phase | Deliverable | Est. time |
|-------|-------------|-----------|
| **1. Schema + service** | `llm-judge.service.ts` with all four judge functions, Zod schemas, migration 019 (eval columns + `llm_judge_pairwise` table), unit tests with fake LLM. | 0.5 day |
| **2. Settings API + storage** | `/api/settings/judge` GET/PATCH route. Zod validation. DB row for judge config mirroring routing-config storage. | 0.5 day |
| **3. Summarize integration** | `/api/summarize` honours `judge_config` in the request; runs `judgeRubric`/`judgeAbsolute` in parallel with metrics when enabled; persists judge columns. | 0.5 day |
| **4. Fusion integration** | `moa.evaluation.ts` runs `judgePairwise(fused, bestDraft)`; `moa.service.ts` returns it in the fusion payload; persists to `llm_judge_pairwise`. | 0.5 day |
| **5. Settings UI** | Settings page "Evaluation Judge" card: mode radio, style radio, model dropdown, cost banner. Wires to `/api/settings/judge`. | 0.5 day |
| **6. Metrics page UI** | `JudgeRubricWidget`, `JudgePairwiseBadge`, `JudgeJustificationPanel`. Conditional rendering by `judge_mode`. Tab additions. | 1 day |
| **7. Debug page UI** | Judge Verdict subsection on the fusion debug panel. | 0.5 day |
| **8. Batch harness** | `collect-metrics.ts` gains judge flags; Markdown + JSON reports gain judge sections. | 0.5 day |
| **9. Thesis artefact** | Re-run 50-article batch in `both` mode. Generate comparison: overlap-ranking vs judge-ranking, per-dimension win rates. Markdown table for thesis chapter. | 0.5 day |

**Total ≈ 5 focused days.** Phases 1–4 are the working pipeline; 5–7 are
UX; 8–9 are the thesis deliverable.

## 6. Testing Strategy

- **Unit:** Fake `generateJsonCompletion` in service tests; verify rubric
  parsing, position randomization for pairwise, error handling, cost calc.
- **Integration:** Single article round-trip through `/api/summarize`
  with each of the three judge modes; assert correct DB columns.
- **Regression:** Existing MoA tests must stay green.
- **Batch smoke:** 3-article batch with `--judge-mode both` before full
  50-article thesis run.

## 7. Cost Model (GPT-4o judge, 1500-token Vietnamese article)

| Operation | Input tokens | Output tokens | Cost |
|-----------|-------------|---------------|------|
| `judgeRubric` | ~2,000 | ~150 | ~$0.006 |
| `judgeAbsolute` | ~1,900 | ~50 | ~$0.005 |
| `judgePairwise` | ~2,200 | ~200 | ~$0.008 |
| `judgeNWayRanker` (3 candidates) | ~2,400 | ~80 | ~$0.007 |

50-article `both`-mode batch ≈ $0.70 (rubric × 50) + $0.40 (pairwise × 50)
≈ **$1.10** added on top of existing fusion cost. Once-per-thesis expense.

## 8. Success Criteria

1. Settings page toggles between the three judge modes; persistence +
   reload work correctly.
2. Running the 50-article thesis batch in `both` mode yields a table:
   - Overlap-metric ranking (fused vs best-draft) — current baseline
   - LLM-judge ranking (fused vs best-draft), per dimension
   - Evidence of the methodology gap predicted by the MoA investigation
3. Per-summary rubric scores visible on the Metrics page with
   justification.
4. Fusion debug page shows the pairwise verdict clearly.
5. `metrics_only` mode behaves identically to current production — zero
   regression for users who don't enable the judge.

## 9. Out of Scope

- Multi-judge ensembling (GPT-4 + Claude + Gemini averaged). Future work.
- Human evaluation UI — covered in the **full metrics system PRD**, not
  here.
- Automatic factuality metrics (QAFactEval, SummaC) — covered in the
  full metrics system PRD.
- Judge mode for the fact-check feature — summarization-only here.
- AlpacaEval's length-controlled regression debiasing — we use a prompt
  instruction instead; if bias appears in the batch, revisit.

## 10. Open Questions

- **Judge bias toward longer answers?** Known AlpacaEval issue. Mitigation
  in prompt (§2.4); also report length-adjusted summary stats alongside
  the judge verdict in the batch report.
- **Inter-run variance?** Consider running the pairwise judge 3× and
  majority-voting for the final thesis table, even though single-shot is
  fine for per-summary UI.
- **Does the judge see the draft summaries when judging a fused output?**
  No — that would leak information. Judge sees only source + the
  summary(ies) being evaluated.
- **Position bias in pairwise?** Mitigated by randomizing A/B order per
  call and tracking the randomization seed alongside the verdict.
