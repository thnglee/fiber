/**
 * Factuality runner — bridges the stored judge_config (which now also carries
 * factuality_enabled / factuality_model) to a per-summary call to
 * `scoreFactuality`. Returns a payload ready for `saveEvaluationMetrics`.
 *
 * Mirrors llm-judge.runner.ts so summarize.service.ts can fan-out judge +
 * factuality + lexical metrics + BERTScore in one Promise.all.
 */

import { getSupabaseAdmin } from "@/lib/supabase"
import { getAllModelConfigs } from "@/services/model-config.service"
import {
  scoreFactuality as defaultScoreFactuality,
  type FactualityServiceResult,
} from "@/services/factuality.service"
import type { JudgeConfig } from "@/domain/schemas"
import type { ModelConfig } from "@/domain/types"

export interface FactualityPersistFields {
  factuality_total_claims: number | null
  factuality_entailed_claims: number | null
  factuality_entailed_ratio: number | null
  factuality_hallucinations: Array<{ claim: string; reason: string }> | null
  factuality_not_mentioned: Array<{ claim: string; reason: string }> | null
  factuality_model: string | null
  factuality_cost_usd: number | null
  factuality_latency_ms: number | null
}

const HARD_DEFAULTS: { factuality_enabled: boolean; factuality_model: string } = {
  factuality_enabled: false,
  factuality_model: "gpt-4o-mini",
}

// ────────────────────────────────────────────────────────────────────────────
// Dependency injection
// ────────────────────────────────────────────────────────────────────────────

export interface FactualityRunnerDeps {
  getStoredConfig: () => Promise<Pick<JudgeConfig, "factuality_enabled" | "factuality_model">>
  getModelByName: (name: string) => Promise<ModelConfig | null>
  scoreFactuality: (
    summary: string,
    source: string,
    opts: { model: ModelConfig; logContext?: string },
  ) => Promise<FactualityServiceResult>
}

async function defaultGetStoredConfig() {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "judge_config")
      .single()
    if (error || !data) return HARD_DEFAULTS
    const value = (data.value ?? {}) as Partial<JudgeConfig>
    return {
      factuality_enabled: value.factuality_enabled ?? HARD_DEFAULTS.factuality_enabled,
      factuality_model: value.factuality_model ?? HARD_DEFAULTS.factuality_model,
    }
  } catch {
    return HARD_DEFAULTS
  }
}

async function defaultGetModelByName(name: string): Promise<ModelConfig | null> {
  try {
    const all = await getAllModelConfigs()
    return all.find(m => m.model_name === name) ?? null
  } catch {
    return null
  }
}

const defaultDeps: FactualityRunnerDeps = {
  getStoredConfig: defaultGetStoredConfig,
  getModelByName: defaultGetModelByName,
  scoreFactuality: defaultScoreFactuality,
}

// ────────────────────────────────────────────────────────────────────────────
// Per-summary runner
// ────────────────────────────────────────────────────────────────────────────

/**
 * Run the factuality scoring on a single summary. Returns persistence-ready
 * fields, or `null` when factuality is disabled or the call fails. All errors
 * are swallowed and logged so a factuality failure cannot break the
 * surrounding summarize/persistence flow.
 */
export async function runFactualityForSummary(
  summary: string,
  source: string,
  override?: { factuality_enabled?: boolean; factuality_model?: string },
  deps?: Partial<FactualityRunnerDeps>,
): Promise<FactualityPersistFields | null> {
  const merged: FactualityRunnerDeps = { ...defaultDeps, ...deps }
  const stored = await merged.getStoredConfig()

  const enabled = override?.factuality_enabled ?? stored.factuality_enabled
  if (!enabled) return null

  const modelName = override?.factuality_model ?? stored.factuality_model
  const model = await merged.getModelByName(modelName)
  if (!model) {
    console.warn(
      `[factuality.runner] factuality model "${modelName}" not found in model_configurations — skipping factuality`,
    )
    return null
  }

  try {
    const r = await merged.scoreFactuality(summary, source, {
      model,
      logContext: "factuality-runner",
    })
    return {
      factuality_total_claims: r.total_claims,
      factuality_entailed_claims: r.entailed_claims,
      factuality_entailed_ratio: r.entailed_ratio,
      factuality_hallucinations: r.hallucinations,
      factuality_not_mentioned: r.not_mentioned,
      factuality_model: r.judge_model,
      factuality_cost_usd: r.cost_usd,
      factuality_latency_ms: r.latency_ms,
    }
  } catch (err) {
    console.error("[factuality.runner] scoreFactuality call failed:", err)
    return null
  }
}
