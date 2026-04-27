  # Overall Dev Plan — Evaluation Redesign

  **Branch:** `feature/llm-judge-evaluation`
  **Start date:** 2026-04-25
  **Purpose of this file:** One place to see every phase, what it does, and
  why it matters. Tell Claude *"work on J1"* (or any code below) and it
  knows exactly what to build from here + the referenced PRD.

  ---

  ## The big picture (why any of this exists)

  The MoA fusion feature already ships, but our overlap metrics (ROUGE /
  BLEU / BERTScore) **can't measure what the paper actually claims**. The
  paper uses GPT-4 as a judge; we use n-gram overlap against the source.
  They measure different things. When we force the fusion aggregator to
  stay close to the source (the "fix" we tried), every metric gets
  worse — not because the feature is broken, but because our measurement
  is incomplete.

  **So we stop fixing the feature and start fixing the measurement.** We
  build a three-axis evaluation system:

  | Axis | What it answers | Status |
  |---|---|---|
  | **A. Content retention** | Is the summary grounded in the source? | Already built (ROUGE/BLEU/BERTScore/compression) |
  | **B. Quality & preference** | Is it faithful, fluent, preferred by a judge? | **Building now (Stages 1–4)** |
  | **C. Human validation** | Do real humans agree? | **Building now (Stage 5)** |

  With all three axes, the thesis defense has a story regardless of how
  the numbers fall — see `thesis_defense_narratives.md` for the three
  pre-committed storylines.

  ---

  ## Stage 1 — Core judge pipeline  ⇦  START HERE

  **Goal:** Make the LLM-as-judge feature work end-to-end behind the scenes.
  No UI yet — just the plumbing.

  ### J1 · Build the judge service
  **What it is:** A new file `backend/services/llm-judge.service.ts` with
  three functions:
  - `judgeRubric(summary, source)` → scores a summary 1–5 on 5 dimensions
    (faithfulness, coverage, fluency, conciseness, overall) + short
    justification.
  - `judgePairwise(A, B, source)` → compares two summaries, returns
    winner + per-dimension preference.
  - `judgeAbsolute(summary, source)` → single 1–10 holistic score.

  **Why it matters:** Without this, nothing else in this plan can happen.
  Judge calls happen via the existing `generateJsonCompletion` helper, so
  we reuse all existing multi-provider support.

  **Source:** `llm_judge_PRD.md` §3.1 + Phase 1.

  ### J2 · Settings API for judge config
  **What it is:** A new HTTP route `GET/PATCH /api/settings/judge` +
  database row storing `{ judge_mode, judge_model, judge_style }`.

  **Why it matters:** Users need to turn the judge on/off and pick which
  model to use. This follows the exact same pattern as the existing
  `/api/settings/routing`.

  **Source:** `llm_judge_PRD.md` §3.3 + Phase 2.

  ### J3 · Hook judge into /api/summarize
  **What it is:** Every time a user summarizes an article, if judge is
  enabled, run the judge on the result and save its scores to the
  database.

  **Why it matters:** Makes the judge a first-class part of the
  summarization flow. From here on, every summary can carry judge scores.

  **Source:** `llm_judge_PRD.md` §3.1 + Phase 3.

  ### J4 · Hook judge into fusion
  **What it is:** When fusion runs (3 proposers + 1 aggregator), call
  `judgePairwise(fused, bestDraft)` after the aggregator finishes. Save
  the verdict to a new `llm_judge_pairwise` table.

  **Why it matters:** **This is the defense-critical measurement.** It
  directly answers *"does fusion beat the best single draft in the paper's
  own framework?"* Every other phase is in service of this number being
  trustworthy and visible.

  **Source:** `llm_judge_PRD.md` §3.1 + Phase 4.

  ---

  ## Stage 2 — Stats + UI + batch

  **Goal:** Make the judge results trustworthy (with p-values) and visible
  (in three UIs).

  ### S1 · Build stats helper
  **What it is:** `backend/output-fusion/scripts/stats.ts` with functions
  for `mean`, `stdev`, and `signTestPValue`.

  **Why it matters:** Every headline number (*"fused wins 35/50 times"*)
  needs a p-value so the committee can tell if it's real or noise.

  **Source:** `stats_devplan.md` §3.

  ### S2 · Add stats to batch reports
  **What it is:** Extend `collect-metrics.ts` so batch reports (the ones
  you run against 50 articles) automatically include a "Statistical
  Significance" section. Adds a `--stats-only` flag that re-processes
  already-saved batches without making new API calls.

  **Why it matters:** Turns raw batch numbers into defense-ready tables
  without re-spending API credit.

  **Source:** `stats_devplan.md` §3.2.

  ### J5 · Settings page UI
  **What it is:** On `backend/app/settings/page.tsx`, add a card
  *"Evaluation Judge"* with:
  - Radio: Metrics only / LLM-Judge only / Both
  - Dropdown: which model to use as judge (default gpt-4o)
  - Cost banner showing the per-summary cost impact

  **Why it matters:** The feature the user can actually click. Without
  it, only the backend can use the judge.

  **Source:** `llm_judge_PRD.md` §3.4 + Phase 5.

  ### J6 · Metrics page UI
  **What it is:** On `backend/app/metrics/page.tsx`, show judge scores
  alongside the existing metric columns. New visual widgets:
  - `JudgeRubricWidget` — small radar chart of the 5 dimensions
  - `JudgePairwiseBadge` — *"Fused wins"* / *"Best-draft wins"* / *"Tie"*
  - Collapsible justification panel

  **Why it matters:** Where the student + committee actually look at
  results during the defense.

  **Source:** `llm_judge_PRD.md` §3.5 + Phase 6.

  ### J7 · Debug page UI
  **What it is:** On `backend/app/debug/page.tsx`, add a *"Judge Verdict"*
  subsection under the existing fusion panel.

  **Why it matters:** When a committee member asks *"what did the judge
  say about article #17?"*, we can pull it up instantly.

  **Source:** `llm_judge_PRD.md` §3.6 + Phase 7.

  ### J8 · Batch harness judge flags
  **What it is:** Add `--judge-mode` / `--judge-model` / `--judge-style`
  flags to `collect-metrics.ts` so the 50-article thesis batch can run
  with judge enabled.

  **Why it matters:** Unblocks J9 (the actual thesis batch).

  **Source:** `llm_judge_PRD.md` §3.7 + Phase 8.

  ---

  ## Stage 3 — First defense-grade numbers

  ### J9 · Run the thesis batch
  **What it is:** Run `collect-metrics.ts --judge-mode both` against 50
  articles. Produces a JSON + Markdown report with overlap metrics AND
  judge scores AND pairwise verdicts AND statistical significance.

  **Why it matters:** **This is the thesis's central empirical result.**
  After this phase, you can write the Axis A + Axis B chapters of the
  thesis.

  **Source:** `llm_judge_PRD.md` Phase 9 + `thesis_defense_narratives.md`
  for what to do with whichever result you get.

  ---

  ## Stage 4 — Three-axis extensions

  **Goal:** Strengthen the thesis beyond the minimum. Adds a cheaper
  factuality check and a cleaner metrics page.

  ### M-A · Factuality service
  **What it is:** `backend/services/factuality.service.ts`. Splits a
  summary into atomic claims, asks `gpt-4o-mini` whether each is entailed
  by the source, returns `{ claims, entailed, hallucinations }`.

  **Why it matters:** Catches hallucinations **directly and cheaply**
  (~$0.002 per summary vs ~$0.006 for full rubric). Sharper than the
  judge's holistic "faithfulness" score.

  **Source:** `metrics_system_PRD.md` §5 + Phase A.

  ### M-B · Factuality UI
  **What it is:** Adds *"Faithfulness 4/5 · Hallucinations 0/5"* column
  group on the metrics page with a tooltip listing contradicted claims.

  **Why it matters:** Single-glance hallucination visibility. Great
  defense talking point: *"zero hallucinations across 50 summaries."*

  **Source:** `metrics_system_PRD.md` Phase B.

  ### M-C · Axis view toggle
  **What it is:** New `Compact / Full` toggle on the metrics page. In
  Full view, each row shows three color-coded axis strips
  (green=retention, blue=quality, orange=human) that collapse
  independently.

  **Why it matters:** Makes the three-axis story visually obvious to
  anyone reading the page for 5 seconds.

  **Source:** `metrics_system_PRD.md` §4 + Phase C.

  ---

  ## Stage 5 — Human validation

  **Goal:** Add the third evaluation axis. Small human study, ~20 articles,
  3 raters. Committee's classic question *"did a human actually read
  these?"* now has a yes.

  ### M-D · Human-eval schema + API
  **What it is:** Migration 021 creates `human_eval_tasks` + `human_eval_responses`
  tables. New routes at `/api/human-eval` for creating tasks and
  submitting rankings.

  **Why it matters:** Database-level foundation for the human study.

  **Source:** `metrics_system_PRD.md` §6 + Phase D.

  ### M-E · Human-eval ranking page
  **What it is:** A new page at `localhost:3000/evaluate` showing an
  article + K summaries with their model names hidden. User drag-drops
  to rank them and writes a one-sentence justification per summary.

  **Why it matters:** The UI that actual human raters (you + 2
  classmates) use to produce the data.

  **Source:** `metrics_system_PRD.md` §6 + Phase E.

  ### M-F · Fleiss' κ + CSV export
  **What it is:** Admin view that computes inter-rater agreement and
  exports raw rankings to CSV for the thesis appendix.

  **Why it matters:** Inter-rater agreement is the rigor number the
  committee will check. A `κ > 0.4` is publishable.

  **Source:** `metrics_system_PRD.md` §6 + Phase F.

  ---

  ## Stage 6 — Final deliverable

  ### M-G · Unified report generator
  **What it is:** One script that reads all three axes from the database
  and emits a single thesis-ready Markdown table covering content
  retention + quality + human validation.

  **Why it matters:** Eliminates copy-paste errors when writing the
  thesis results chapter.

  **Source:** `metrics_system_PRD.md` §8 + Phase G.

  ### M-H · Run the 20-article human study
  **What it is:** Sit down with 2 classmates, rate 20 articles, commit
  results. Produces the final numbers for the thesis methodology
  chapter.

  **Why it matters:** **This is the closing artefact.** After M-H, the
  evaluation redesign is complete and the thesis can be written.

  **Source:** `metrics_system_PRD.md` §11 + Phase H.

  ---

  ## How to instruct Claude

  - *"Start J1"* → Claude reads this file + `llm_judge_PRD.md` §3.1 and
    begins building the judge service.
  - *"What's next?"* → Claude finds the first unchecked box in the
    Implementation Checklist in `CLAUDE.md`.
  - *"Resume"* → same as above.
  - *"Tick J4 off"* → Claude updates the checkbox in CLAUDE.md after
    confirming the phase is actually done.

  Total work = **17 phases** grouped into 6 stages. Stages 1–3 (10
  phases) produce the minimum defense-grade artefact. Stages 4–6 (7
  phases) strengthen the contribution.

  Companion docs:
  - `llm_judge_PRD.md` — detailed spec for the judge module
  - `metrics_system_PRD.md` — detailed spec for the three-axis framework
  - `stats_devplan.md` — spec for the error bars + p-values
  - `thesis_defense_narratives.md` — pre-committed defense stories
  - `fusion.pdf` — the MoA paper we're evaluating
