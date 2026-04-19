/**
 * User-configurable extension settings, persisted in chrome.storage.local.
 *
 * Powers the options page (routing mode) and is read by the summary-sidebar
 * before hitting `/api/summarize`.
 */

export type RoutingMode = "forced" | "auto" | "evaluation"

export interface FiberSettings {
  routingMode: RoutingMode
}

export const SETTINGS_STORAGE_KEY = "fiberSettings"

export const DEFAULT_SETTINGS: FiberSettings = {
  routingMode: "forced",
}

function hasChromeStorage(): boolean {
  return (
    typeof chrome !== "undefined" &&
    !!chrome.storage &&
    !!chrome.storage.local
  )
}

function normalizeSettings(raw: unknown): FiberSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS }
  const obj = raw as Partial<FiberSettings>
  const mode: RoutingMode = (() => {
    switch (obj.routingMode) {
      case "auto":
      case "evaluation":
      case "forced":
        return obj.routingMode
      default:
        return DEFAULT_SETTINGS.routingMode
    }
  })()
  return { routingMode: mode }
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
