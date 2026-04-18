import React, { useEffect, useMemo, useState } from "react"
import "~/contents/style.css"
import { Card } from "~/components/ui/Card"
import { Button } from "~/components/ui/Button"
import { fetchModelAvailability, type ModelAvailability } from "~/lib/api-client"
import {
  DEFAULT_SETTINGS,
  FUSION_CONSTRAINTS,
  loadSettings,
  saveSettings,
  validateFusion,
  type FiberSettings,
  type RoutingMode,
} from "~/lib/settings"

const MODE_OPTIONS: { value: RoutingMode; label: string; description: string }[] = [
  {
    value: "forced",
    label: "Forced — single model",
    description: "Dùng một mô hình duy nhất cho mỗi lần tóm tắt (mặc định).",
  },
  {
    value: "auto",
    label: "Auto — complexity routing",
    description: "Tự động chọn mô hình dựa trên độ dài/độ phức tạp bài viết.",
  },
  {
    value: "evaluation",
    label: "Evaluation — compare models",
    description: "Chạy song song nhiều mô hình và chọn bản tóm tắt tốt nhất.",
  },
  {
    value: "fusion",
    label: "Fusion (MoA) — synthesize drafts",
    description: "Chạy song song các proposer rồi dùng aggregator tổng hợp kết quả.",
  },
]

type ToastKind = "success" | "error"

interface Toast {
  kind: ToastKind
  message: string
}

function groupByProvider(models: ModelAvailability[]): Record<string, ModelAvailability[]> {
  const grouped: Record<string, ModelAvailability[]> = {}
  for (const m of models) {
    const key = m.provider || "other"
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(m)
  }
  return grouped
}

const Options: React.FC = () => {
  const [settings, setSettings] = useState<FiberSettings>(DEFAULT_SETTINGS)
  const [availability, setAvailability] = useState<ModelAvailability[]>([])
  const [loading, setLoading] = useState(true)
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [loaded, models] = await Promise.all([
          loadSettings(),
          fetchModelAvailability().catch(err => {
            console.error("[Options] Failed to fetch availability:", err)
            if (!cancelled) {
              setAvailabilityError(
                err instanceof Error ? err.message : "Không tải được danh sách mô hình",
              )
            }
            return [] as ModelAvailability[]
          }),
        ])
        if (!cancelled) {
          setSettings(loaded)
          setAvailability(models)
          setLoading(false)
        }
      } catch (err) {
        console.error("[Options] Failed to load settings:", err)
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 2500)
    return () => window.clearTimeout(id)
  }, [toast])

  const proposerCandidates = useMemo(
    () => availability.filter(m => m.can_be_proposer || !m.is_available),
    [availability],
  )
  const aggregatorCandidates = useMemo(
    () => availability.filter(m => m.can_be_aggregator || !m.is_available),
    [availability],
  )

  const validationError =
    settings.routingMode === "fusion" ? validateFusion(settings.fusion) : null

  const persist = async (next: FiberSettings) => {
    setSettings(next)
    try {
      await saveSettings(next)
      setToast({ kind: "success", message: "Đã lưu cài đặt." })
    } catch (err) {
      console.error("[Options] Save failed:", err)
      setToast({
        kind: "error",
        message: err instanceof Error ? err.message : "Lưu thất bại",
      })
    }
  }

  const handleModeChange = (mode: RoutingMode) => {
    persist({ ...settings, routingMode: mode })
  }

  const toggleProposer = (modelName: string, checked: boolean) => {
    const current = settings.fusion.proposerModels
    let next: string[]
    if (checked) {
      if (current.includes(modelName)) return
      if (current.length >= FUSION_CONSTRAINTS.MAX_PROPOSERS) {
        setToast({
          kind: "error",
          message: `Tối đa ${FUSION_CONSTRAINTS.MAX_PROPOSERS} proposer.`,
        })
        return
      }
      next = [...current, modelName]
    } else {
      next = current.filter(m => m !== modelName)
    }
    persist({
      ...settings,
      fusion: { ...settings.fusion, proposerModels: next },
    })
  }

  const handleAggregatorChange = (modelName: string) => {
    persist({
      ...settings,
      fusion: { ...settings.fusion, aggregatorModel: modelName },
    })
  }

  const handleTimeoutChange = (ms: number) => {
    persist({
      ...settings,
      fusion: { ...settings.fusion, timeoutMs: ms },
    })
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-gray-900">Fiber — Cài đặt</h1>
          <p className="text-sm text-gray-500 mt-1">
            Chọn chế độ tóm tắt và cấu hình Mixture-of-Agents.
          </p>
        </header>

        {loading ? (
          <Card>
            <p className="text-sm text-gray-500">Đang tải…</p>
          </Card>
        ) : (
          <>
            <Card>
              <h2 className="text-base font-semibold text-gray-900 mb-3">
                Chế độ tóm tắt
              </h2>
              <div className="space-y-2">
                {MODE_OPTIONS.map(opt => (
                  <label
                    key={opt.value}
                    className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:border-gray-300 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="routing-mode"
                      value={opt.value}
                      checked={settings.routingMode === opt.value}
                      onChange={() => handleModeChange(opt.value)}
                      className="mt-1"
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-900">{opt.label}</div>
                      <div className="text-xs text-gray-500">{opt.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </Card>

            {settings.routingMode === "fusion" && (
              <Card>
                <h2 className="text-base font-semibold text-gray-900 mb-1">
                  Cấu hình Fusion (MoA)
                </h2>
                <p className="text-xs text-gray-500 mb-4">
                  Chọn {FUSION_CONSTRAINTS.MIN_PROPOSERS}–{FUSION_CONSTRAINTS.MAX_PROPOSERS}{" "}
                  proposer (Layer 1) và 1 aggregator (Layer 2).
                </p>

                {availabilityError ? (
                  <div className="text-sm text-red-600 mb-3">
                    Không tải được mô hình: {availabilityError}
                  </div>
                ) : null}

                <section className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">
                    Layer 1 — Proposers
                  </h3>
                  <div className="text-xs text-gray-500 mb-2">
                    Đã chọn: {settings.fusion.proposerModels.length}/
                    {FUSION_CONSTRAINTS.MAX_PROPOSERS}
                  </div>
                  {Object.entries(groupByProvider(proposerCandidates)).map(
                    ([provider, models]) => (
                      <div key={provider} className="mb-3">
                        <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">
                          {provider}
                        </div>
                        <div className="space-y-1">
                          {models.map(m => {
                            const checked = settings.fusion.proposerModels.includes(
                              m.model_name,
                            )
                            const disabled = !m.can_be_proposer
                            return (
                              <label
                                key={m.model_name}
                                className={`flex items-center gap-2 p-2 rounded ${
                                  disabled
                                    ? "opacity-50 cursor-not-allowed"
                                    : "hover:bg-gray-50 cursor-pointer"
                                }`}
                                title={disabled ? m.unavailable_reason : undefined}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={disabled}
                                  onChange={e => toggleProposer(m.model_name, e.target.checked)}
                                />
                                <span className="text-sm text-gray-900">
                                  {m.display_name}
                                </span>
                                <span className="text-xs text-gray-400">
                                  ({m.model_name})
                                </span>
                                {disabled && m.unavailable_reason && (
                                  <span className="text-xs text-amber-600 ml-auto">
                                    {m.unavailable_reason}
                                  </span>
                                )}
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    ),
                  )}
                </section>

                <section className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">
                    Layer 2 — Aggregator
                  </h3>
                  <select
                    value={settings.fusion.aggregatorModel}
                    onChange={e => handleAggregatorChange(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    {aggregatorCandidates.map(m => (
                      <option
                        key={m.model_name}
                        value={m.model_name}
                        disabled={!m.can_be_aggregator}
                      >
                        {m.display_name}
                        {!m.can_be_aggregator && m.unavailable_reason
                          ? ` — ${m.unavailable_reason}`
                          : ""}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Aggregator cần hỗ trợ structured output (JSON).
                  </p>
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">
                    Per-proposer timeout: {(settings.fusion.timeoutMs / 1000).toFixed(0)}s
                  </h3>
                  <input
                    type="range"
                    min={FUSION_CONSTRAINTS.MIN_TIMEOUT_MS}
                    max={FUSION_CONSTRAINTS.MAX_TIMEOUT_MS}
                    step={1000}
                    value={settings.fusion.timeoutMs}
                    onChange={e => handleTimeoutChange(Number(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>{FUSION_CONSTRAINTS.MIN_TIMEOUT_MS / 1000}s</span>
                    <span>{FUSION_CONSTRAINTS.MAX_TIMEOUT_MS / 1000}s</span>
                  </div>
                </section>

                {validationError && (
                  <div className="mt-4 text-sm text-red-600">{validationError}</div>
                )}
              </Card>
            )}

            <div className="flex items-center justify-end gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => persist({ ...DEFAULT_SETTINGS })}
              >
                Khôi phục mặc định
              </Button>
            </div>

            {toast && (
              <div
                className={`fixed bottom-6 right-6 px-4 py-2 rounded-lg shadow-lg text-sm text-white ${
                  toast.kind === "success" ? "bg-gray-900" : "bg-red-600"
                }`}
              >
                {toast.message}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default Options
