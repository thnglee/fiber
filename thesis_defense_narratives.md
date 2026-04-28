# Thesis Defense Narratives — Pre-Committed

**Written:** 2026-04-24 (before LLM-judge batch results exist)
**Purpose:** Lock in the three possible defense stories *before* looking at
the numbers. Whichever scenario the results land in, we walk into the
defense with a prepared narrative — never rationalizing post-hoc in front
of the committee.

**Scope:** Three scenarios for the LLM-judge pairwise comparison
(fused vs best-draft across 50 articles).

---

## Scenario A — Fused wins on LLM-judge

**Trigger:** Judge prefers fused in ≥55% of articles (with p < 0.05 on the
paired sign test).

### Headline claim
*"Mixture-of-Agents replicates on Vietnamese grounded summarization under
the paper's own evaluation framework."*

### The story
1. We implemented MoA faithfully from Wang et al. 2024.
2. Under the **original paper's metric** (GPT-4 pairwise preference), fused
   beats the best single draft — consistent with the paper's 65.1% LC win
   rate on AlpacaEval.
3. Under **overlap metrics against the source** (ROUGE/BLEU/BERTScore),
   fused loses. We document exactly why: overlap metrics reward n-gram
   parroting; the paper's aggregator is explicitly instructed *not* to
   parrot. This is a **methodological finding**, not a bug.
4. The contribution is a **three-axis evaluation framework** that exposes
   this methodology gap for Vietnamese news summarization.

### Evidence to show
- Table B.2 (pairwise win rate): fused wins X%, p-value.
- Table A (overlap metrics): fused loses, with Δ-per-article stdev.
- Sample pair from the batch: side-by-side where fused wins on judge but
  loses on ROUGE, with judge rationale highlighted.

### One-liner for the talk
*"When we measure with the paper's own tool, the paper's result holds.
When we measure with n-gram overlap against the source, it reverses —
and that reversal is the thesis's methodological contribution."*

### Likely committee questions
- **"How is GPT-4 a reliable judge?"** → Cite AlpacaEval 2.0 LC's 0.98
  Spearman with human raters (paper §3.1). Note we also control for
  length bias and position bias.
- **"Why not use a human reference summary for ROUGE?"** → Vietnamese
  news sites don't publish gold summaries. Our 20-article human peer
  study (Axis C) substitutes.

---

## Scenario B — Fused loses on LLM-judge

**Trigger:** Judge prefers best-draft in ≥55% of articles, or the
difference is not significant (p > 0.05).

### Headline claim
*"Mixture-of-Agents as published does not transfer to Vietnamese grounded
summarization — here is precisely why, and what this tells us about LLM
output-fusion methodology."*

### The story
1. We implemented MoA exactly as specified and tested it on the paper's
   own evaluation framework.
2. The paper's claimed gains **did not replicate** in our setting.
3. Through a three-axis analysis we pinpoint the reasons:
   - Paper's benchmarks are **instruction-following** (AlpacaEval) and
     **reasoning** (MT-Bench). Summarization against a **grounded source**
     is a different task family. The aggregator's "synthesize from model
     responses" behavior has nothing to verify against in the paper's
     benchmarks, but introduces drift when there is a source of truth.
   - All three of our proposers are from **one provider family (OpenAI)**.
     Paper Table 3 shows diverse proposers are required for the effect.
   - Vietnamese-specific factors: the models' Vietnamese capabilities may
     not diverge enough to benefit from fusion.
4. This is a **negative result with a concrete methodological diagnosis**
   — which the field needs, since the paper's claims are currently treated
   as universal.

### Evidence to show
- Table B.2 (pairwise win rate): best-draft wins X%, p-value.
- Table A (overlap metrics): best-draft also wins — consistent
  across axes.
- Three-way aggregator-prompt experiment from `fix/moa-aggregator-source-prompt`
  branch: shows behavior shifts but doesn't recover.

### One-liner for the talk
*"A faithful implementation of a widely-cited paper does not replicate
on Vietnamese grounded summarization. The thesis pinpoints three
reasons — task family, proposer diversity, and language coverage —
that together explain the gap."*

### Likely committee questions
- **"Did you try harder to make it work?"** → Yes: three aggregator-prompt
  variants, all tested. Cite the `fix/moa-aggregator-source-prompt` branch
  evidence.
- **"Isn't a negative result a weak thesis?"** → A well-diagnosed negative
  result is standard in empirical ML research; cite examples if needed
  (e.g. the "emergent abilities may be a mirage" 2023 paper).

---

## Scenario C — Mixed results (axes disagree)

**Trigger:** Fused wins on some axes (e.g. LLM-judge faithfulness) and
loses on others (e.g. conciseness, or ROUGE overall). Likely the most
realistic outcome.

### Headline claim
*"Fusion quality depends on what you measure — a three-axis evaluation
framework reveals which gains are real and which are artefacts of the
metric choice."*

### The story
1. MoA produces summaries that are **more faithful and better-covering**
   (Axis B rubric dimensions) but **more verbose and less source-overlapping**
   (Axis A compression + ROUGE).
2. Human raters (Axis C) break the tie.
3. Depending on the user goal:
   - Extension end-user skimming a feed → wants concise, high-overlap
     summaries → **best-draft wins**.
   - Reader wanting editorial reliability → wants faithful synthesis →
     **fused wins**.
4. The thesis's real contribution is the **framework to make this choice
   explicit**, not a "one-size-fits-all" recommendation.

### Evidence to show
- Radar chart overlaying the two approaches' rubric scores.
- Cross-axis correlation table: where axes agree vs disagree per article.
- Human eval table with Fleiss' κ.
- Product recommendation: ship best-draft as default, offer fusion as
  opt-in "editorial mode."

### One-liner for the talk
*"Whether fusion wins depends on what 'better' means. Our framework makes
that dependency explicit for the first time in Vietnamese news
summarization."*

### Likely committee questions
- **"Which should we ship?"** → Best-draft as default (cheaper, higher
  overlap, preferred for skim-reading). Fusion as an opt-in editorial
  mode. Evidence in Axis C preference data.
- **"Aren't you hedging?"** → No — the methodological contribution is the
  framework. Mixed results are a feature of it working correctly.

---

## Which scenario is most likely?

Based on the three-way batch on `fix/moa-aggregator-source-prompt`:
- Overlap metrics definitely regress (Axis A = **loss** — known).
- Judge behavior untested. Paper priors: 65%+ AlpacaEval win. Our setting
  priors: summarization, homogeneous proposers, Vietnamese — each pushes
  down from 65%. Estimate: **~50–60% judge win rate** for fused.

→ **Scenario C (mixed) is most probable.** That's also the thesis's
strongest story.

---

## Defense preparation checklist

| Item | Owner | When |
|---|---|---|
| Print these narratives, re-read before the defense | You | T-1 day |
| Have the three evidence tables (A, B, C) ready to pull up | You | T-3 days |
| Rehearse the one-liner for each scenario | You | T-3 days |
| Keep the `fix/moa-aggregator-source-prompt` branch accessible on laptop | You | T-1 day |
| Print fusion.pdf with key sections highlighted | You | T-1 day |
