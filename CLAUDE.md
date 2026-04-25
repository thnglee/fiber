# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Fiber** — a browser extension + full-stack backend that automatically summarizes and fact-checks Vietnamese news articles using AI. University thesis project.
  
## Repository Structure

```
extension/   # Plasmo browser extension (React + TypeScript + Tailwind)
backend/     # Next.js 14 App Router API server
bert/        # BERTScore microservice (FastAPI + Python + PhoBERT)
shared/      # Shared TypeScript types
docs/        # Documentation
metrics_reports/  # Evaluation datasets and test results
```

## Commands

### Backend (`cd backend`)
```bash
npm install
npm run dev        # http://localhost:3000
npm run build
npm run lint
npm run test:streaming
```

### Extension (`cd extension`)
```bash
npm install
npm run dev        # Plasmo dev mode with hot reload
npm run build
npm run package    # Package for distribution
```

### BERTScore Microservice (`cd bert`)
```bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 7860
pytest bert/test_bert.py
```

## Architecture

```
Browser Extension (Plasmo)
  → injects summary sidebar & fact-check UI into Vietnamese news sites
  → calls backend API at PLASMO_PUBLIC_API_URL

Backend (Next.js API routes)
  /api/summarize      LLM summarization with optional token streaming
  /api/fact-check     search-augmented fact verification (Tavily → OpenAI)
  /api/metrics        evaluation data CRUD (Supabase)
  /api/dashboard      user action tracking
  /api/logs/stream    SSE debug feed
  /api/evaluate       trigger metrics computation

  Services layer (backend/services/):
    llm.service.ts              structured OpenAI calls with Zod output schemas
    summarize.service.ts        orchestrates summarization flow
    fact-check.service.ts       search → LLM pipeline
    evaluation.service.ts       ROUGE, BLEU computation + Supabase persistence
    bert.service.ts             calls BERTScore microservice (truncates to 256 tokens)
    content-extraction.service.ts  @mozilla/readability + JSDOM
    search.service.ts           Tavily wrapper
    compression.service.ts      compression rate calculation
    action-tracking.service.ts  logs actions to dashboard_actions table

BERTScore Microservice (FastAPI)
  POST /calculate-score  ← called by bert.service.ts
  Uses vinai/phobert-base for Vietnamese semantic similarity
  Deployable to Hugging Face Spaces via Dockerfile
```

## Key Files

| File | Purpose |
|------|---------|
| `backend/config/env.ts` | Environment variable validation (Zod) |
| `backend/domain/schemas.ts` | Zod schemas for all API request/response shapes |
| `backend/domain/types.ts` | TypeScript domain types |
| `shared/types.ts` | Shared types used by both extension and backend |
| `backend/supabase/migrations/` | DB schema migrations |

## Environment Variables (backend/.env)

```
OPENAI_API_KEY=
TAVILY_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
BERT_SERVICE_URL=         # URL of BERTScore microservice (optional)
OPENAI_MODEL=gpt-4o-mini  # optional override
OPENAI_TEMPERATURE=0.7    # optional override
```

Extension optionally uses `extension/.env`:
```
PLASMO_PUBLIC_API_URL=http://localhost:3000/api
```

## Database (Supabase)

Two main tables:
- `evaluation_metrics` — ROUGE/BLEU/BERTScore/compression/latency per summarization
- `dashboard_actions` — Extension user action log (summarize, fact-check events)

## Supported News Sites

tuoitre.vn, thanhnien.vn, vietnamnet.vn, laodong.vn, tienphong.vn, vtv.vn, nld.com.vn

## Notes

- All API request/response shapes validated with Zod (`backend/domain/schemas.ts`)
- BERTScore input is truncated to 256 tokens before calling the microservice
- Supabase service role key is server-side only via `getSupabaseAdmin()`
- Evaluation datasets stored in `metrics_reports/` across 5 topic categories: thoi_su, phap_luat, kinh_te, giao_duc, van_hoa

## Output Fusion (MoA) — Open Investigation

**Status:** Shipped on `main` (PRs #32, #33, tuning commit `0b00421`). Quality is NOT improving as the paper claims. Experimental branch `fix/moa-aggregator-source-prompt` tried the "inject the original article into the aggregator prompt" hypothesis and **falsified** it — see three-way results below.

**Source of truth:** `fusion.pdf` (Wang et al., 2024, arXiv:2406.04692). The original feature spec (`fusion_PRD.md`) shipped via PR #32 and has been archived out of the root; the live evaluation-redesign direction is captured by the PRDs listed below.

### Three-way batch comparison (3 OpenAI proposers + gpt-4o aggregator, 50 tienphong.vn articles)

| Metric | **Baseline** (no source in agg) | v1 (strict source rules) | v2 (soft source reference) |
|--------|---------------------------------|--------------------------|-----------------------------|
| N | 48 | 49 | 49 |
| Fused BERT | 0.6387 | 0.6233 | 0.6143 |
| Best-draft BERT | 0.6506 | 0.6541 | 0.6525 |
| Fused − Best BERT | **−0.0118** | −0.0308 | −0.0382 |
| Fused ROUGE-1 | 0.3442 | 0.2349 | 0.2396 |
| Fused ROUGE-L | 0.2551 | 0.1842 | 0.1822 |
| Fused BLEU | 0.0708 | 0.0273 | 0.0277 |
| Fused length (% of article) | 35.6 | 24.2 | 24.7 |
| Avg-draft length (% of article) | 29.2 | 28.8 | 28.9 |
| Wins vs best-draft BERT | 17/48 (35%) | 3/49 (6%) | 1/49 (2%) |
| Wins vs best-draft ROUGE-1 | 24/48 (50%) | 0/49 | 0/49 |

**Evidence files** (checked into `metrics_reports/results/`):
- `fusion-batch-50.{json,md}` — baseline
- `fusion-batch-50-with-source.{json,md}` — v1 strict (experimental branch)
- `fusion-batch-50-source-v2.{json,md}` — v2 soft (experimental branch)

### Key finding — the "missing article" bug was not actually a bug

The mere presence of the article in the aggregator's context shifts its behavior from *draft-stitching* to *editorial synthesis from source*. The aggregator confidently extracts the minimum key facts and rewrites them cleanly instead of leaning on draft phrasing. Compression flips from 22% **longer** than average draft (baseline) to ~17% **shorter** (v1/v2). Shorter + editorial rewrite ⇒ collapsed n-gram overlap ⇒ ROUGE / BLEU / BERTScore all drop.

This confirms the top hypothesis: **our metrics (ROUGE / BLEU / BERTScore against the source) punish the exact behavior the paper's LLM-judge evaluators reward.** The paper's aggregator prompt doesn't include source material either — because AlpacaEval / MT-Bench / FLASK are instruction-following, not grounded summarization, and the judging is done by GPT-4 preference rather than overlap.

Softening the rules (v2) vs strict rules (v1) made no meaningful difference — the effect is driven by the article being in context at all, not by the exact wording around it.

### Implications for the thesis

1. **Overlap metrics cannot tell the MoA story.** Our current numeric setup structurally disadvantages a correctly-implemented aggregator. Any "fix" that improves overlap is likely just making the aggregator parrot draft phrasing (which the paper explicitly says NOT to do: *"should not simply replicate the given answers; instead provide a refined, accurate, and comprehensive reply"*).
2. **Add an LLM-judge preference comparator.** This is the single most important thesis artefact — it lets us report results in the paper's own terms (GPT-4 grading fused vs best-draft on a rubric). Without it, the thesis has no way to show MoA's real contribution.
3. **Document the methodology caveat explicitly** (PRD §7 already flags this): ROUGE/BLEU are computed against the original article, not a human-written reference summary — so they measure content-retention, not summary quality.
4. **Diverse proposers (Gemini + Anthropic + OpenAI) remains untested** — still worth trying with the LLM-judge metric once that's in place, but overlap metrics are no longer a useful signal here.

### What to try next

- Add an LLM-judge comparator (priority — unblocks the thesis).
- Re-run the diverse-proposer configuration with LLM-judge (not with overlap metrics alone).
- Keep `main`'s aggregator prompt as-is (baseline is the best overlap-metric configuration the system is capable of, even though it's not "correctly" implemented per the PRD).

### Key files

- `backend/output-fusion/moa.service.ts` — orchestration
- `backend/output-fusion/moa.prompt.ts` — aggregator prompt (main = no source; branch `fix/moa-aggregator-source-prompt` = source injected, falsified)
- `backend/output-fusion/moa.config.ts` — proposer/aggregator defaults
- `backend/output-fusion/scripts/collect-metrics.ts` — batch harness (`--skip-forced` for fusion-only)
- `metrics_reports/results/fusion-batch-50*.{json,md}` — three-way evidence
- `fusion.pdf` — paper (the only spec; original `fusion_PRD.md` archived after feature shipped)

## Evaluation Redesign — New Direction (2026-04-24)

The MoA investigation converted from "fix the feature" to "fix the
measurement." The thesis contribution reframes as: *"Why overlap metrics
cannot evaluate Mixture-of-Agents summarization: a three-axis empirical
analysis."*

**Two new PRDs ship on branch `feature/llm-judge-evaluation`:**

### `llm_judge_PRD.md` — LLM-as-Judge module

Paper-aligned (Wang et al. 2024, fusion.pdf Appendix Table 5 + §3.1)
evaluation pathway with four judge styles:

- **Rubric** (FLASK-derived, 5 dims × 1–5) — per-summary display
- **Absolute** (MT-Bench-style, 1–10 holistic) — single-number compare
- **Pairwise** (AlpacaEval-style, length-controlled) — fused vs best-draft; the defense-critical number
- **N-way ranker** (paper Appendix Table 5 prompt) — optional

Settings persistence follows the existing `/api/settings/routing` pattern
(server-side via Supabase, NOT `chrome.storage.local`). UI lives in the
Next.js backend (`backend/app/settings`, `backend/app/metrics`,
`backend/app/debug`), not the Plasmo extension. Judge mode is
`metrics_only` / `judge_only` / `both`, **orthogonal** to routing mode.

Plan: 9 phases, ~5 days. See `llm_judge_PRD.md`.

### `metrics_system_PRD.md` — Three-axis evaluation framework

Wraps the LLM-judge module and the existing overlap metrics into a single
coherent system:

- **Axis A — Content Retention**: ROUGE / BLEU / BERTScore / compression
  (existing, kept; document the "vs source not human reference" caveat).
- **Axis B — Quality & Preference**: LLM-judge (from judge PRD) + new
  `factuality.service.ts` (claim-entailment + hallucination counting via
  `gpt-4o-mini`).
- **Axis C — Human Validation**: new `backend/app/evaluate/` page with
  blind K-way ranking UI, 20-article peer study, Fleiss' κ reported, CSV
  export.

Metrics page gains a `Compact / Full` axis-view toggle with color-coded
axis strips (green=A, blue=B, orange=C). Unified report generator emits a
single thesis-ready Markdown with all three axes.

Plan: 8 phases, ~6 days on top of the judge PRD (total ≈ 11 days).

### Thesis narrative (what this unlocks)

The defense chapter reframes as:
1. Methodology (introduce the three axes + overlap caveat)
2. Axis A results (MoA loses on overlap — expected, documented)
3. Axis B results (MoA wins on judge + factuality — the paper's story)
4. Axis C results (20-article human peer study with κ)
5. Cross-axis analysis (when do axes agree/disagree — the novel
   methodological contribution)
6. Recommendation (which approach to ship)

### Branch hygiene

- `feature/llm-judge-evaluation` — contains the two PRDs. Implementation
  work (phases 1–9 of judge + A–H of metrics system) happens on this
  branch.
- `fix/moa-aggregator-source-prompt` — experimental artefact (v1 strict
  article-in-prompt). Do NOT merge to main. Preserves the falsification
  evidence + the `fusion-batch-50-with-source.{json,md}` and
  `fusion-batch-50-source-v2.{json,md}` batches.
- `main` — untouched by the evaluation redesign until judge + factuality
  are merged.

### Implementation Checklist (live — update as work progresses)

Source docs: `llm_judge_PRD.md`, `metrics_system_PRD.md`,
`stats_devplan.md`, `thesis_defense_narratives.md`. Tick boxes as phases
complete. Order matters — later phases depend on earlier ones.

**Stage 1 — Core judge pipeline**
- [x] **J1** `llm-judge.service.ts` (rubric + pairwise), Zod schemas, migration 019, unit tests *(llm_judge_PRD §3.1–3.2, Phase 1)*
- [x] **J2** `/api/settings/judge` GET/PATCH route + Supabase persistence *(Phase 2)*
- [x] **J3** `/api/summarize` honours `judge_config`; persists judge columns *(Phase 3)*
- [x] **J4** `moa.evaluation.ts` pairwise + `llm_judge_pairwise` table write *(Phase 4)*

**Stage 2 — Stats + UI + batch**
- [ ] **S1** `stats.ts` helper (mean, stdev, sign-test p-value) + unit tests *(stats_devplan §3)*
- [ ] **S2** `collect-metrics.ts` gains `--stats-only` + Statistical Significance section
- [ ] **J5** Settings page "Evaluation Judge" card *(Phase 5)*
- [ ] **J6** Metrics page conditional rendering + `JudgeRubricWidget` + `JudgePairwiseBadge` *(Phase 6)*
- [ ] **J7** Debug page Judge Verdict subsection *(Phase 7)*
- [ ] **J8** Batch harness `--judge-mode` / `--judge-model` flags *(Phase 8)*

**Stage 3 — Thesis artefact (first defense-grade numbers)**
- [ ] **J9** Run 50-article batch in `--judge-mode both`, generate the three-way table *(Phase 9)*

**Stage 4 — Three-axis extensions**
- [ ] **M-A** `factuality.service.ts` (claim-entailment via gpt-4o-mini) + migration 020 *(metrics_system_PRD Phase A)*
- [ ] **M-B** Factuality column group on metrics page *(Phase B)*
- [ ] **M-C** Axis view toggle (Compact / Full) with color-coded strips *(Phase C)*

**Stage 5 — Human validation**
- [ ] **M-D** Human-eval schema + `/api/human-eval` API + migration 021 *(Phase D)*
- [ ] **M-E** `backend/app/evaluate/` blind K-way ranking UI + rater flow *(Phase E)*
- [ ] **M-F** Fleiss' κ + CSV export *(Phase F)*

**Stage 6 — Final deliverable**
- [ ] **M-G** Unified report generator (all three axes in one Markdown) *(Phase G)*
- [ ] **M-H** 20-article human peer study + final thesis methodology table *(Phase H)*

**Total:** 17 checkboxes. Stages 1–3 (10 boxes) produce the minimum
defense-grade artefact. Stages 4–6 (7 boxes) strengthen the three-axis
contribution. Contingency narratives for whichever scenario J9 lands in
are pre-committed in `thesis_defense_narratives.md`.
