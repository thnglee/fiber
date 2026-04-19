import React, { useEffect, useState } from "react"
import "~/contents/style.css"
import { Card } from "~/components/ui/Card"
import { Button } from "~/components/ui/Button"
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
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
]

type ToastKind = "success" | "error"

interface Toast {
  kind: ToastKind
  message: string
}

const Options: React.FC = () => {
  const [settings, setSettings] = useState<FiberSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<Toast | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const loaded = await loadSettings()
        if (!cancelled) {
          setSettings(loaded)
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

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-gray-900">Fiber — Cài đặt</h1>
          <p className="text-sm text-gray-500 mt-1">
            Chọn chế độ tóm tắt cho tiện ích.
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
