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
npm run dev               # http://localhost:3000
npm run build
npm run lint
npm run test:streaming
npm run test:judge        # LLM-judge service + runner tests
npm run test:moa          # MoA fusion tests
npm run moa:collect-metrics -- --input <urls.json>   # batch harness
npm run report:unified    # three-axis thesis report → metrics_reports/results/
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
    llm-judge.service.ts        LLM-as-judge: rubric / absolute / pairwise scoring
    llm-judge.runner.ts         glue: reads judge_config, runs judge, swallows errors
    factuality.service.ts       claim-entailment + hallucination counting (gpt-4o-mini)
    factuality.runner.ts        glue: mirrors llm-judge.runner.ts shape
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

Core tables:
- `evaluation_metrics` — one row per summary. Holds ROUGE/BLEU/BERTScore/compression/latency (Axis A) plus `judge_*` columns (rubric JSONB, absolute, justification, cost, latency) and `factuality_*` columns (entailed ratio, claim counts, hallucinations JSONB) for Axis B.
- `dashboard_actions` — extension user-action log (summarize, fact-check events).
- `llm_judge_pairwise` — one row per fused-vs-best-draft verdict produced during fusion runs. Linked to `moa_fusion_results` and `routing_decisions`.
- `human_eval_tasks` — admin-created bundles of (article + K labelled candidate summaries with hidden model/mode). Axis C.
- `human_eval_responses` — per-rater ranking + rationale. Unique on `(task_id, rater_id)`.
- `app_settings` — singleton config rows. `judge_config` controls the judge feature (`judge_mode`, default model, default style, `factuality_enabled`).
- `moa_fusion_results` / `moa_draft_results` — per-fusion-run records (aggregator + each proposer draft).
- `routing_decisions`, `model_configurations` — routing infrastructure.

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

## Three-Axis Evaluation System (the thesis contribution)

The MoA investigation above showed overlap metrics structurally punish editorial-synthesis. So we built a multi-axis evaluation system. The thesis question reframes as: *"Why overlap metrics cannot evaluate Mixture-of-Agents summarization: a three-axis empirical analysis."*

Branch: `feature/llm-judge-evaluation`. All code work is shipped; only the human study itself (running rater sessions) remains.

### The three axes

**Axis A — Content Retention** (already-existing overlap metrics)
ROUGE-1/2/L, BLEU, BERTScore (PhoBERT), compression rate. Computed against the source article (not a human reference summary) — caveat documented in the methodology chapter.

**Axis B — Quality & Preference** (LLM-as-judge + factuality)
- **Rubric** — FLASK-derived 5 dimensions × 1–5 (faithfulness, coverage, fluency, conciseness, overall) + Vietnamese justification.
- **Absolute** — MT-Bench-style 1–10 holistic.
- **Pairwise** — AlpacaEval-style A vs B with **position randomization** (controls for known LLM position bias). The defense-critical number: fused vs best-draft.
- **N-way ranker** — built but currently unused.
- **Factuality** — splits a summary into atomic claims, classifies each as entailed / contradicted / not-mentioned via `gpt-4o-mini`. Surfaces hallucinations as a hard count.

**Axis C — Human Validation** (blind K-way ranking)
Admin builds tasks at `/evaluate/admin` (model names hidden — raters see Bản A / Bản B / …). Raters drag-rank at `/evaluate?task=<uuid>` and write a one-sentence rationale per summary. Aggregate computes per-approach avg-rank + win-rate + **Fleiss' κ** inter-rater agreement (κ > 0.4 is the publishable threshold).

`judge_mode` (`metrics_only` / `judge_only` / `both`) is **orthogonal** to `routing_mode` — they compose freely.

### Key files

```
backend/services/
  llm-judge.service.ts         judgeRubric, judgeAbsolute, judgePairwise, judgeNWayRanker
  llm-judge.runner.ts          resolveJudgeConfig + runJudgeForSummary (error-swallowing)
  factuality.service.ts        scoreFactuality (claim split → entailment classification)
  factuality.runner.ts         glue, mirrors llm-judge.runner.ts

backend/output-fusion/
  moa.evaluation.ts            pickBestDraftForJudge + runFusionPairwiseJudge
  moa.persistence.ts           saveLLMJudgePairwise
  scripts/stats.ts             mean, stdev, signTestPValue, pairedMetricStats,
                               fleissKappa, fleissKappaFromRankings, aggregateRankings
  scripts/collect-metrics.ts   batch harness — --judge-mode/--judge-style/--judge-model/--stats-only
  scripts/unified-report.ts    pulls all 3 axes from Supabase → one Markdown report

backend/app/
  api/settings/judge/route.ts  GET/PATCH judge_config (mirrors /api/settings/routing pattern)
  api/human-eval/route.ts      POST = create task; GET[?id&reveal=1] = rater view or admin list
  api/human-eval/respond/      POST ranking + rationale (validates permutation; 409 on duplicate rater)
  api/human-eval/report/       GET aggregate (avg-rank, win-rate, κ)
  api/human-eval/export/       GET CSV (one row per rater × label, hidden_model revealed)
  evaluate/page.tsx            rater UI (Vietnamese, drag-drop + ▲▼ buttons; header hidden)
  evaluate/admin/page.tsx      admin: Create tab + Review tab with κ band labels
  metrics/page.tsx             axisView toggle (compact/full), localStorage-persisted
  metrics/components/
    JudgeRubricWidget.tsx      radar chart of 5 dimensions
    JudgePairwiseBadge.tsx     fused-wins / best-draft-wins / tie pill
    FactualityBadge.tsx        entailment % with click-to-expand contradictions
    JudgeJustificationPanel.tsx  LLM's one-sentence reasoning

backend/supabase/migrations/
  019_add_llm_judge.sql        judge_* columns + llm_judge_pairwise table + judge_config seed
  020_add_factuality.sql       factuality_* columns + factuality defaults merged into judge_config
  021_add_human_eval.sql       human_eval_tasks + human_eval_responses with RLS
```

### How to use

```bash
# 1. Turn the judge on at /settings (Evaluation Judge card)
#    or PATCH /api/settings/judge with { judge_mode: "both", factuality_enabled: true }

# 2. Run a batch with judge enabled:
cd backend
npx tsx output-fusion/scripts/collect-metrics.ts \
  --input output-fusion/scripts/sample-urls-tienphong-50.json \
  --judge-mode both --judge-style rubric --judge-model gpt-4o

# 3. (For Axis C) Build human-eval tasks at /evaluate/admin,
#    share /evaluate?task=<uuid> URLs to raters, collect responses.

# 4. Generate the unified thesis-ready report (all three axes):
npm run report:unified
# Optional: scope by date or human-eval tasks, also write JSON sidecar
npm run report:unified -- --since 2026-04-01 --task-ids <uuid1>,<uuid2> --json
```

### Where to find each number in the DB

- **Rubric scores** → `evaluation_metrics.judge_rubric` (JSONB, 5 dimensions)
- **Pairwise verdicts (fused vs best-draft)** → `llm_judge_pairwise`
- **Factuality** → `evaluation_metrics.factuality_*` columns (`factuality_enabled` must be on)
- **Human rankings** → `human_eval_responses.ranking` (one row per rater × task)

### `judge_config` shape (in `app_settings`)

```json
{
  "judge_mode": "metrics_only" | "judge_only" | "both",
  "default_judge_model": "gpt-4o",
  "default_judge_style": "rubric" | "absolute",
  "factuality_enabled": false,
  "factuality_model": "gpt-4o-mini"
}
```

### Test commands

```bash
npm run test:judge      # llm-judge.service + runner tests
npm run test:moa        # MoA fusion tests (1 known-pre-existing failure on prompt literal)
npx tsx --test output-fusion/__tests__/stats.test.ts \
  services/__tests__/factuality.service.test.ts
```

### Thesis narrative (what the system unlocks)

1. Methodology — introduce the three axes + the overlap-vs-source caveat
2. Axis A results — MoA loses on overlap (expected, documented)
3. Axis B results — MoA wins on judge + factuality (the paper's story)
4. Axis C results — 20-article human peer study with κ
5. Cross-axis analysis — when do the three axes agree / disagree (the novel methodological contribution)
6. Recommendation — which approach to ship

### Background docs

- `overall_devplan.md` — original 17-phase plan (all code work shipped)
- `llm_judge_PRD.md` — judge service spec
- `metrics_system_PRD.md` — three-axis framework spec
- `stats_devplan.md` — sign-test + κ math notes
- `thesis_defense_narratives.md` — pre-committed contingency stories

### Status

All code shipped. Live counts in Supabase: ~2050 evaluation rows, 28 pairwise verdicts (J9 thesis batch), 0 human-eval responses. Only remaining work is the **20-article peer study** itself — sit down with 2 raters and use `/evaluate/admin` to mint share URLs, then re-run `npm run report:unified` to refresh Axis C in the report. No more code required.

### Branch hygiene

- `feature/llm-judge-evaluation` — the three-axis system. Active.
- `fix/moa-aggregator-source-prompt` — experimental artefact (v1 strict article-in-prompt). **Do NOT merge to main** — preserves the falsification evidence + the `fusion-batch-50-with-source.{json,md}` and `fusion-batch-50-source-v2.{json,md}` batches.
- `main` — untouched by the evaluation redesign.
