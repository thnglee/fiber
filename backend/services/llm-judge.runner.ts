/**
 * LLM-Judge runner — bridges the stored/request-overridden judge config to
 * the per-summary judge calls (rubric/absolute) and produces a payload ready
 * for `saveEvaluationMetrics`.
 *
 * Pairwise (fused vs best-draft) lives in `output-fusion/moa.evaluation.ts`
 * — see J4.
 */

import { getSupabaseAdmin } from "@/lib/supabase"
import { getAllModelConfigs } from "@/services/model-config.service"
import {
  judgeRubric as defaultJudgeRubric,
  judgeAbsolute as defaultJudgeAbsolute,
  type JudgeRubricServiceResult,
  type JudgeAbsoluteServiceResult,
} from "@/services/llm-judge.service"
import type { JudgeConfig, JudgeRequest } from "@/domain/schemas"
import type { JudgePersistFields } from "@/services/evaluation.service"
import type { ModelConfig } from "@/domain/types"

const HARD_DEFAULTS: JudgeConfig = {
  judge_mode: "metrics_only",
  default_judge_model: "gpt-4o-mini",
  default_judge_style: "rubric",
  factuality_enabled: false,
  factuality_model: "gpt-4o-mini",
}

// ────────────────────────────────────────────────────────────────────────────
// Dependency injection
// ────────────────────────────────────────────────────────────────────────────

export interface RunnerDeps {
  getStoredConfig: () => Promise<JudgeConfig>
  getModelByName: (name: string) => Promise<ModelConfig | null>
  judgeRubric: (
    summary: string,
    source: string,
    opts: { model: ModelConfig; logContext?: string },
  ) => Promise<JudgeRubricServiceResult>
  judgeAbsolute: (
    summary: string,
    source: string,
    opts: { model: ModelConfig; logContext?: string },
  ) => Promise<JudgeAbsoluteServiceResult>
}

async function defaultGetStoredConfig(): Promise<JudgeConfig> {
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
      judge_mode: value.judge_mode ?? HARD_DEFAULTS.judge_mode,
      default_judge_model:
        value.default_judge_model ?? HARD_DEFAULTS.default_judge_model,
      default_judge_style:
        value.default_judge_style ?? HARD_DEFAULTS.default_judge_style,
      factuality_enabled:
        value.factuality_enabled ?? HARD_DEFAULTS.factuality_enabled,
      factuality_model:
        value.factuality_model ?? HARD_DEFAULTS.factuality_model,
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

const defaultDeps: RunnerDeps = {
  getStoredConfig: defaultGetStoredConfig,
  getModelByName: defaultGetModelByName,
  judgeRubric: defaultJudgeRubric,
  judgeAbsolute: defaultJudgeAbsolute,
}

// ────────────────────────────────────────────────────────────────────────────
// Effective-config resolution
// ────────────────────────────────────────────────────────────────────────────

export interface EffectiveJudgeConfig {
  judge_mode: JudgeConfig["judge_mode"]
  judge_model: string
  judge_style: JudgeConfig["default_judge_style"]
}

/**
 * Merge stored DB config with optional per-request override. Override wins
 * per-field; missing fields fall back to the stored config; missing stored
 * fields fall back to hard defaults.
 */
export async function resolveJudgeConfig(
  override?: JudgeRequest,
  deps?: Partial<RunnerDeps>,
): Promise<EffectiveJudgeConfig> {
  const merged: RunnerDeps = { ...defaultDeps, ...deps }
  const stored = await merged.getStoredConfig()
  return {
    judge_mode: override?.judge_mode ?? stored.judge_mode,
    judge_model:
      override?.judge_model ?? stored.default_judge_model ?? HARD_DEFAULTS.default_judge_model,
    judge_style:
      override?.judge_style ?? stored.default_judge_style ?? HARD_DEFAULTS.default_judge_style,
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Per-summary runner
// ────────────────────────────────────────────────────────────────────────────

/**
 * Run the configured judge style on a single summary. Returns persistence-ready
 * fields, or `null` when the judge is disabled (`metrics_only`) or the call
 * fails. All errors are swallowed and logged so a judge failure cannot break
 * the surrounding summarize/persistence flow.
 */
export async function runJudgeForSummary(
  summary: string,
  source: string,
  override?: JudgeRequest,
  deps?: Partial<RunnerDeps>,
): Promise<JudgePersistFields | null> {
  const merged: RunnerDeps = { ...defaultDeps, ...deps }
  const effective = await resolveJudgeConfig(override, merged)

  if (effective.judge_mode === "metrics_only") return null

  const model = await merged.getModelByName(effective.judge_model)
  if (!model) {
    console.warn(
      `[llm-judge.runner] judge model "${effective.judge_model}" not found in model_configurations — skipping judge`,
    )
    return null
  }

  try {
    if (effective.judge_style === "absolute") {
      const r = await merged.judgeAbsolute(summary, source, {
        model,
        logContext: "llm-judge-runner-absolute",
      })
      return {
        judge_mode: effective.judge_mode,
        judge_model: r.judge_model,
        judge_style: "absolute",
        judge_rubric: null,
        judge_absolute: r.score,
        judge_justification: r.justification,
        judge_latency_ms: r.latency_ms,
        judge_cost_usd: r.cost_usd,
      }
    }

    // rubric (default)
    const r = await merged.judgeRubric(summary, source, {
      model,
      logContext: "llm-judge-runner-rubric",
    })
    return {
      judge_mode: effective.judge_mode,
      judge_model: r.judge_model,
      judge_style: "rubric",
      judge_rubric: r.scores,
      judge_absolute: null,
      judge_justification: r.justification,
      judge_latency_ms: r.latency_ms,
      judge_cost_usd: r.cost_usd,
    }
  } catch (err) {
    console.error("[llm-judge.runner] judge call failed:", err)
    return null
  }
}
