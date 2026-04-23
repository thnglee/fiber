# PRD: Full Evaluation Metrics System

**Project:** Fiber — Browser Extension + Backend for Vietnamese News AI
**Branch:** `feature/llm-judge-evaluation` (this PRD extends the LLM-judge
module with the rest of the evaluation framework)
**Status:** Ready for planning
**Motivation:** The MoA investigation exposed a single-axis blind spot — our
overlap-based metrics only answer "is the summary grounded in the source?"
To defensibly compare summarization approaches (Forced, Auto, Evaluation,
Fusion, and future approaches) the thesis needs **three complementary
axes**: content retention, quality & preference, and human validation.

**Companion PRDs:** `llm_judge_PRD.md` (the quality & preference axis),
`fusion_PRD.md` (the feature being evaluated).

---

## 1. Problem Statement

The MoA three-way batch (see `CLAUDE.md` → "Output Fusion (MoA) — Open
Investigation") proved our current metrics system cannot distinguish
editorial-synthesis quality from n-gram parroting: the aggregator behaved
exactly as the paper intends, and every overlap metric got worse.

This is not a **reliability** failure — ROUGE, BLEU, BERTScore, and
compression rate all measure what they claim to measure, deterministically
and repeatably. It is a **coverage** failure. A defensible thesis
comparison of summarization approaches needs to answer four questions, not
one:

| Question | Current coverage | Needed |
|----------|------------------|--------|
| Is the summary grounded in the source? | ✅ ROUGE / BLEU / BERTScore / compression | Keep |
| Is the summary factually accurate (no hallucinations)? | ❌ | **Factuality axis** |
| Is it fluent, complete, preferred? | ❌ | **LLM-judge axis** (separate PRD) |
| Do real humans agree? | ❌ | **Human validation axis** |

This PRD specifies the whole system so the axes live under one coherent
UI, share one schema, and produce one thesis-ready report.

## 2. Axis Definitions

### 2.1 Axis A — Content Retention (*existing*)

**Already implemented.** No changes required beyond what's already in
`backend/services/`.

| Metric | Service | Direction |
|--------|---------|-----------|
| ROUGE-1 / 2 / L | `evaluation.service.ts` | higher = better |
| BLEU | `evaluation.service.ts` | higher = better |
| BERTScore (PhoBERT) | `bert.service.ts` | higher = better |
| Compression rate | `compression.service.ts` | target band (15–40%) |

**Caveat (document in thesis methodology chapter):** ROUGE/BLEU are
computed against the **source article**, not a human-written reference
summary. This measures content retention, not classical summarization
quality. Every comparison table must state this.

### 2.2 Axis B — Quality & Preference (*new, separate PRD*)

Implemented by `llm_judge_PRD.md`. Consists of three judge styles:

| Style | Output | Used for |
|-------|--------|----------|
| Rubric (FLASK-derived) | 5 dims × 1–5 + overall | Per-summary display |
| Absolute (MT-Bench-style) | 1–10 holistic | Quick single-number comparison |
| Pairwise (AlpacaEval-style) | A / B / tie + per-dim | Fusion: fused vs best-draft |

Plus two **factuality metrics** added in this PRD to complement the LLM-judge's
"faithfulness" dimension with a deterministic, cheaper check:

| Metric | Description | Cost per summary |
|--------|-------------|-------------------|
| **Claim-entailment score** | Split summary into atomic claims; for each, ask a small LLM (gpt-4o-mini) whether the source entails the claim. Output: % of claims entailed. | ~$0.002 |
| **Hallucination count** | Count claims NOT entailed. Surfaces the worst offenders. | included above |

These two metrics don't require the full LLM-judge rubric, but they fit the
same `both`-mode pattern: enable or skip depending on user config.

### 2.3 Axis C — Human Validation (*new*)

The thesis committee will ask: *"did a human actually read these?"* A small
but rigorous human study closes the loop.

**Scope:** 20 articles × K summaries each (K = number of approaches being
compared; typically 3–5). The human ranks them and writes a one-sentence
justification.

**Participants:** The author + 2 Vietnamese-literate peers (standard
practice for an undergraduate thesis — committee won't expect IRB-scale
studies). Inter-annotator agreement (Fleiss' κ) becomes a reported number.

**Output:** A public table with each approach's average rank and win rate.

## 3. System Architecture

```
backend/
├── services/
│   ├── evaluation.service.ts              # EXTEND — orchestrate all axes
│   ├── llm-judge.service.ts               # NEW (from judge PRD)
│   ├── factuality.service.ts              # NEW — claim-entailment + hallucination counting
│   ├── bert.service.ts                    # existing
│   ├── compression.service.ts             # existing
│   └── ...
├── domain/schemas.ts                      # EXTEND — FullMetricsSchema union
├── supabase/migrations/
│   ├── 019_add_llm_judge.sql              # from judge PRD
│   ├── 020_add_factuality.sql             # NEW — factuality columns
│   └── 021_add_human_eval.sql             # NEW — human_eval table
├── app/
│   ├── api/
│   │   ├── human-eval/                    # NEW — GET/POST for human judgments
│   │   │   ├── route.ts
│   │   │   └── export/route.ts
│   │   └── settings/judge/route.ts        # from judge PRD (extended with factuality toggle)
│   └── evaluate/
│       ├── page.tsx                       # NEW — human-eval blind-ranking UI
│       └── components/
│           ├── BlindRankWidget.tsx
│           └── RationaleBox.tsx
```

## 4. UI Grouping — one system, three axes

The Metrics page (`backend/app/metrics/page.tsx`) gains a new **Axis view
mode** toggle: `Compact` / `Full`. In Full view, each row expands into
three horizontal strips color-coded by axis:

```
┌──────────────────────────────────────────────────────────────────────┐
│  Article title / URL · model · mode · timestamp                       │
├──────────────────────────────────────────────────────────────────────┤
│  [A] Content Retention    ROUGE  BLEU  BERT  Compression              │
├──────────────────────────────────────────────────────────────────────┤
│  [B] Quality & Preference  Judge Rubric (radar)  Faithfulness: 4/5    │
│                             Hallucinations: 0/5 claims                 │
├──────────────────────────────────────────────────────────────────────┤
│  [C] Human Validation     Avg rank: 2.0/3  (3 raters, κ=0.62)         │
└──────────────────────────────────────────────────────────────────────┘
```

Each axis strip has a subtle colored left border (green=A, blue=B,
orange=C) and collapses independently. Sortable by any axis.

## 5. Factuality service — details

`backend/services/factuality.service.ts`:

```ts
export async function scoreFactuality(
  summary: string,
  sourceArticle: string,
  opts?: { model?: ModelConfig; logContext?: string },
): Promise<FactualityResult>

interface FactualityResult {
  total_claims: number
  entailed_claims: number
  entailed_ratio: number            // 0..1
  hallucinations: Array<{ claim: string; reason: string }>
  latency_ms: number
  cost_usd: number | null
}
```

**Method:**
1. Prompt `gpt-4o-mini` (cheap) to split the summary into atomic claims,
   return a JSON array.
2. For each claim, prompt the same model: "Given the source, is this
   claim entailed / contradicted / not mentioned?" Batch into one prompt.
3. Compute ratio. Keep the contradictions + not-mentioned items for the UI.

**Alternative (future):** wire in an open-source Vietnamese NLI model
(XNLI-fine-tuned PhoBERT) as a zero-cost path. Out of scope for v1.

## 6. Human-eval UI — `backend/app/evaluate/page.tsx`

A dedicated **blind ranking** page for human raters:

1. **Admin setup** (one-time): pick an article + K summaries from DB.
   System creates a `human_eval_task` row with a shareable URL.
2. **Rater opens URL** → sees the article + K summaries labeled A/B/C
   (real model names hidden). Ranks by drag-drop. Writes a one-sentence
   justification per summary.
3. **Submit** → POST to `/api/human-eval` with the ranking.
4. **Admin report page** shows:
   - Average rank per approach
   - Win rate per approach
   - Fleiss' κ across raters
   - Downloadable CSV for thesis appendix

**DB schema (migration 021):**

```sql
create table human_eval_tasks (
  id uuid primary key,
  article_url text not null,
  article_text text not null,
  summaries jsonb not null,          -- [{label,text,hidden_model,hidden_mode}]
  created_at timestamptz default now()
);

create table human_eval_responses (
  id uuid primary key,
  task_id uuid references human_eval_tasks(id),
  rater_id text not null,            -- free-form; could be email hash
  ranking jsonb not null,            -- [label, label, label]
  rationale jsonb not null,          -- { label: "sentence" }
  created_at timestamptz default now()
);
```

## 7. Phased Development Plan

Assumes `llm_judge_PRD.md` phases 1–4 (service + schema + summarize +
fusion integration) are done first, since they land the shared
infrastructure.

| Phase | Deliverable | Est. time |
|-------|-------------|-----------|
| **A. Factuality service** | `factuality.service.ts` (claim split + entailment check), migration 020, unit tests. Wired into `evaluation.service.ts` behind a new `include_factuality` option. | 0.5 day |
| **B. Factuality UI** | New column group on Metrics page: `Factuality %` + `Hallucinations (N)` with a tooltip that lists the contradicted claims. | 0.5 day |
| **C. Axis view toggle** | `Compact` / `Full` toggle on Metrics page. Axis strips implementation. Color-coded borders. | 1 day |
| **D. Human-eval schema + API** | Migration 021, `/api/human-eval` GET/POST, task creation endpoint for admin. | 0.5 day |
| **E. Human-eval UI** | `backend/app/evaluate/page.tsx` — blind ranking UI, rater flow, admin report page. | 1.5 days |
| **F. Inter-annotator stats** | Fleiss' κ computation + display. CSV export for thesis appendix. | 0.5 day |
| **G. Unified report generator** | Extend `collect-metrics.ts` to emit a single thesis-ready "full report" Markdown containing all three axes + comparison tables. | 0.5 day |
| **H. Thesis artefact** | Run one 20-article human eval alongside the 50-article LLM-judge batch. Produce the final methodology chapter table. | 1 day |

**Total ≈ 6 days** on top of the LLM-judge PRD's ~5 days → ~11 days for
the full system. Phases A–C are the automated additions; D–F are the
human-study infrastructure; G–H are the thesis deliverables.

## 8. Evaluation Report Schema

The unified report (generated by `collect-metrics.ts --full`) produces a
single Markdown file with this structure:

```
## Axis A — Content Retention
| Approach | ROUGE-1 | ROUGE-L | BLEU | BERTScore | Compression |

## Axis B — Quality & Preference
### B.1 LLM-Judge rubric (FLASK-derived)
| Approach | Faithfulness | Coverage | Fluency | Conciseness | Overall |

### B.2 LLM-Judge pairwise (fusion only)
| Pair | A-wins | B-wins | Ties | Winner |

### B.3 Factuality
| Approach | Entailment % | Avg hallucinations | Worst case |

## Axis C — Human Validation
| Approach | Avg rank | Win rate | Fleiss' κ |
```

This is the thesis methodology chapter's results table, copy-paste ready.

## 9. Success Criteria

1. The Metrics page's `Full` view shows all three axes for any row that
   has data in them. `Compact` view remains unchanged.
2. Factuality toggle on Settings → Evaluation Judge card enables/disables
   claim-entailment scoring.
3. The 20-article human eval produces a completed table with Fleiss' κ
   reported.
4. The unified report generator produces the full three-axis table in
   one command.
5. Thesis methodology chapter has a single paragraph explaining the
   three axes and citing this PRD.
6. No regressions in `metrics_only` mode — users who only want the
   existing ROUGE/BLEU/BERT see no changes.

## 10. Out of Scope

- Crowdsourced human eval (Prolific, MTurk) — thesis scope is small-N
  peer study.
- Bootstrap confidence intervals on every metric — add if committee asks.
- Auto-discovery of articles needing human eval (active learning).
- QAFactEval / SummaC / FactScore — good future alternatives to our
  LLM-based factuality check; if performance becomes a concern, swap
  in a Vietnamese-NLI model instead.
- Vietnamese readability formulas (syllable-count-based) — possible but
  low thesis impact vs effort.

## 11. Thesis Chapter Outline (what this PRD unlocks)

Once this system ships, the thesis evaluation chapter can be structured
as:

1. **Methodology** — introduce three axes; cite this PRD; acknowledge
   the overlap-metric-vs-source caveat explicitly.
2. **Axis A: Content Retention Results** — ROUGE/BLEU/BERT table across
   approaches. Note the MoA paper's FLASK-conciseness caveat applies
   here.
3. **Axis B: Quality & Preference Results** — LLM-judge rubric + pairwise
   + factuality. This is where MoA is finally allowed to win.
4. **Axis C: Human Validation Results** — 20-article peer study table
   with Fleiss' κ.
5. **Cross-axis analysis** — the methodology-gap discussion: when do the
   three axes agree? When do they disagree (e.g. MoA wins B, loses A)?
   This is the novel empirical contribution.
6. **Recommendation** — which approach to ship, and under what
   user-goal assumption.

This structure converts the "MoA regresses" finding from a failure into
the thesis's methodological centerpiece.
