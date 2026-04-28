# Unified Three-Axis Evaluation Report

- **Generated:** 2026-04-27T16:39:43.183Z
- **Source:** Supabase (`evaluation_metrics`, `llm_judge_pairwise`, `human_eval_*`)
- **Coverage:** 2051 eval rows · 28 pairwise verdicts · 0 human-eval task(s) · 0 human ranking(s)

## Axis A — Content Retention

Overlap metrics computed against the source article (not a human reference summary). Higher = more grounded in the source. See methodology caveat in `metrics_system_PRD.md` §2.1.

| Approach (mode \| model) | n | ROUGE-1 | ROUGE-L | BLEU | BERTScore | Compression % |
|---|---|---|---|---|---|---|
| fusion | moa:gpt-4.1 | 1 | 0.9808 | 0.9423 | 0.5361 | 0.8543 | 121.74 |
| sync | VietAI/vit5-large-vietnews-summarization | 124 | 0.2479 | 0.2479 | 0.1174 | 0.8514 | 25.59 |
| sync | gpt-4.1-2025-04-14 | 1 | 0.9519 | 0.8654 | 0.3842 | 0.7980 | 122.83 |
| sync | claude-haiku-4-5-20251001 | 6 | 0.9801 | 0.9018 | 0.3059 | 0.7787 | 149.55 |
| fusion | moa:gpt-4o-mini | 2 | 0.9712 | 0.8846 | 0.3661 | 0.7603 | 148.37 |
| sync | claude-sonnet-4-5-20250929 | 16 | 0.3295 | 0.2650 | 0.0852 | 0.6644 | 32.37 |
| stream | gpt-4o-mini-2024-07-18 | 313 | 0.2484 | 0.1889 | 0.0330 | 0.6426 | 23.31 |
| sync | o4-mini-2025-04-16 | 203 | 0.3250 | 0.2470 | 0.0592 | 0.6364 | 33.78 |
| sync | gpt-4.1-mini-2025-04-14 | 212 | 0.2981 | 0.2268 | 0.0492 | 0.6288 | 29.02 |
| sync | gpt-4o-mini-2024-07-18 | 653 | 0.2534 | 0.1973 | 0.0334 | 0.6265 | 27.72 |
| sync | gpt-4o-2024-08-06 | 257 | 0.3448 | 0.2479 | 0.0674 | 0.6258 | 52.00 |
| fusion | moa:gpt-4o | 208 | 0.2718 | 0.2112 | 0.0353 | 0.6192 | 31.15 |
| stream | gpt-4o | 52 | 0.2846 | 0.2047 | 0.0211 | 0.5999 | 25.38 |
| sync | o3-mini-2025-01-31 | 3 | 0.1401 | 0.1044 | 0.0008 | 0.5835 | 12.80 |

## Axis B — Quality & Preference

### B.1 LLM-Judge rubric (FLASK-derived, 1–5 per dimension)

| Approach (mode \| model) | n | Faithfulness | Coverage | Fluency | Conciseness | Overall |
|---|---|---|---|---|---|---|
| sync | claude-haiku-4-5-20251001 | 5 | 5.00 | 4.80 | 5.00 | 4.80 | 4.80 |
| fusion | moa:gpt-4o | 31 | 4.94 | 4.13 | 5.00 | 4.77 | 4.74 |
| sync | gpt-4o-mini-2024-07-18 | 7 | 4.86 | 4.71 | 5.00 | 4.57 | 4.71 |

### B.2 LLM-Judge pairwise (fusion runs)

| Pair | n | A-wins | B-wins | Ties | Winner | Judge model(s) |
|---|---|---|---|---|---|---|
| fused vs best_draft:o4-mini | 13 | 0 | 12 | 1 | B (best_draft:o4-mini) | gpt-4o-2024-08-06 |
| fused vs best_draft:gpt-4o-mini | 8 | 4 | 3 | 1 | A (fused) | gpt-4o-2024-08-06 |
| fused vs best_draft:gpt-4.1-mini | 6 | 0 | 5 | 1 | B (best_draft:gpt-4.1-mini) | gpt-4o-2024-08-06 |
| fused vs best_draft:claude-haiku-4-5 | 1 | 1 | 0 | 0 | A (fused) | gpt-4o-2024-08-06 |

### B.3 Factuality (claim-entailment via gpt-4o-mini)

_(no factuality scores in window)_

## Axis C — Human Validation

_(no human-eval responses in window)_
