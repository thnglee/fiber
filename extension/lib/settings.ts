/**
 * User-configurable extension settings, persisted in chrome.storage.local.
 *
 * Powers the options page (routing mode + MoA fusion config) and is read by
 * the summary-sidebar before hitting `/api/summarize`.
 */

export type RoutingMode = "forced" | "auto" | "evaluation" | "fusion"

export interface FusionSettings {
  /** Layer 1 proposer model_name values (2–5 models). */
  proposerModels: string[]
  /** Layer 2 aggregator model_name value. */
  aggregatorModel: string
  /** Per-proposer timeout in milliseconds (5_000–30_000). */
  timeoutMs: number
}

export interface FiberSettings {
  routingMode: RoutingMode
  fusion: FusionSettings
}

export const SETTINGS_STORAGE_KEY = "fiberSettings"

export const DEFAULT_FUSION_SETTINGS: FusionSettings = {
  proposerModels: ["gpt-4o-mini", "gemini-2.0-flash-001", "claude-3-5-haiku-latest"],
  aggregatorModel: "gpt-4o",
  timeoutMs: 15_000,
}

export const DEFAULT_SETTINGS: FiberSettings = {
  routingMode: "forced",
  fusion: DEFAULT_FUSION_SETTINGS,
}

export const FUSION_CONSTRAINTS = {
  MIN_PROPOSERS: 2,
  MAX_PROPOSERS: 5,
  MIN_TIMEOUT_MS: 5_000,
  MAX_TIMEOUT_MS: 30_000,
} as const

function hasChromeStorage(): boolean {
  return (
    typeof chrome !== "undefined" &&
    !!chrome.storage &&
    !!chrome.storage.local
  )
}

function mergeFusion(partial?: Partial<FusionSettings>): FusionSettings {
  return {
    proposerModels:
      Array.isArray(partial?.proposerModels) && partial!.proposerModels.length > 0
        ? [...partial!.proposerModels]
        : [...DEFAULT_FUSION_SETTINGS.proposerModels],
    aggregatorModel: partial?.aggregatorModel || DEFAULT_FUSION_SETTINGS.aggregatorModel,
    timeoutMs:
      typeof partial?.timeoutMs === "number"
        ? partial!.timeoutMs
        : DEFAULT_FUSION_SETTINGS.timeoutMs,
  }
}

function normalizeSettings(raw: unknown): FiberSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS }
  const obj = raw as Partial<FiberSettings>
  const mode: RoutingMode = (() => {
    switch (obj.routingMode) {
      case "auto":
      case "evaluation":
      case "forced":
      case "fusion":
        return obj.routingMode
      default:
        return DEFAULT_SETTINGS.routingMode
    }
  })()
  return {
    routingMode: mode,
    fusion: mergeFusion(obj.fusion),
  }
}

export async function loadSettings(): Promise<FiberSettings> {
  if (!hasChromeStorage()) return { ...DEFAULT_SETTINGS }
  return new Promise(resolve => {
    chrome.storage.local.get(SETTINGS_STORAGE_KEY, result => {
      resolve(normalizeSettings(result?.[SETTINGS_STORAGE_KEY]))
    })
  })
}

export async function saveSettings(settings: FiberSettings): Promise<void> {
  if (!hasChromeStorage()) return
  return new Promise(resolve => {
    chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings }, () => resolve())
  })
}

export function validateFusion(fusion: FusionSettings): string | null {
  if (fusion.proposerModels.length < FUSION_CONSTRAINTS.MIN_PROPOSERS) {
    return `Hãy chọn ít nhất ${FUSION_CONSTRAINTS.MIN_PROPOSERS} proposer model.`
  }
  if (fusion.proposerModels.length > FUSION_CONSTRAINTS.MAX_PROPOSERS) {
    return `Chỉ được chọn tối đa ${FUSION_CONSTRAINTS.MAX_PROPOSERS} proposer model.`
  }
  if (!fusion.aggregatorModel) {
    return "Hãy chọn một aggregator model."
  }
  if (
    fusion.timeoutMs < FUSION_CONSTRAINTS.MIN_TIMEOUT_MS ||
    fusion.timeoutMs > FUSION_CONSTRAINTS.MAX_TIMEOUT_MS
  ) {
    return `Timeout phải trong khoảng ${FUSION_CONSTRAINTS.MIN_TIMEOUT_MS / 1000}s–${FUSION_CONSTRAINTS.MAX_TIMEOUT_MS / 1000}s.`
  }
  return null
}
