/**
 * Model affordability tiers — single source of truth for which models the
 * project is willing to spend on right now (~$5/provider budget).
 *
 * - AFFORDABLE_MODEL_NAMES: visible everywhere (active model, proposers, evaluation,
 *   judge, factuality). Cheap mini / haiku / flash variants + free local models.
 * - AGGREGATOR_ONLY_MODEL_NAMES: visible only as the MoA aggregator. Currently
 *   just gpt-4o — the paper's recommended aggregator and the only "premium" model
 *   we still allow, used at most once per fusion run.
 *
 * Anything not in either list is hidden from selection UIs entirely.
 */

export const AFFORDABLE_MODEL_NAMES: ReadonlySet<string> = new Set([
  // OpenAI mini-tier
  "gpt-4o-mini",
  "gpt-4.1-mini",
  // Gemini flash family
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.5-flash",
  // Anthropic haiku
  "claude-haiku-4-5",
  // Free local Vietnamese-tuned models
  "VietAI/vit5-large-vietnews-summarization",
  "vinai/PhoGPT-4B-Chat",
])

export const AGGREGATOR_ONLY_MODEL_NAMES: ReadonlySet<string> = new Set([
  "gpt-4o",
])

export function isAffordableModel(name: string): boolean {
  return AFFORDABLE_MODEL_NAMES.has(name)
}

export function isAggregatorOnlyModel(name: string): boolean {
  return AGGREGATOR_ONLY_MODEL_NAMES.has(name)
}

/** Affordable OR aggregator-only — i.e. allowed somewhere in the UI. */
export function isVisibleModel(name: string): boolean {
  return isAffordableModel(name) || isAggregatorOnlyModel(name)
}
