import React, { useEffect, useMemo, useState } from "react"
import "~/contents/style.css"
import { Card } from "~/components/ui/Card"
import { Button } from "~/components/ui/Button"
import {
  FUSION_STORAGE_KEY,
  SCORE_METRICS,
  type MoAFusionResult,
  type MoAScoredDraft,
  type MoAScores,
} from "~/lib/fusion-types"

interface StoredFusion {
  result: MoAFusionResult
  capturedAt: number
  articleUrl?: string
  articleTitle?: string
}

const STATUS_BADGES: Record<MoAScoredDraft["status"], { label: string; className: string }> = {
  success: { label: "✅ success", className: "bg-green-100 text-green-800" },
  failed: { label: "❌ failed", className: "bg-red-100 text-red-700" },
  timeout: { label: "⏱ timeout", className: "bg-amber-100 text-amber-800" },
}

function formatMs(ms: number | null | undefined): string {
  if (ms == null) return "—"
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`
  return `${ms}ms`
}

function formatUsd(v: number | null | undefined): string {
  if (v == null) return "—"
  if (v >= 0.01) return `$${v.toFixed(4)}`
  return `$${v.toFixed(6)}`
}

function formatScore(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—"
  return v.toFixed(3)
}

function bestSingle(drafts: MoAScoredDraft[], key: keyof MoAScores): number | null {
  let best: number | null = null
  for (const d of drafts) {
    const v = d.scores?.[key]
    if (typeof v === "number" && !Number.isNaN(v)) {
      if (best == null || v > best) best = v
    }
  }
  return best
}

function loadStoredFusion(): Promise<StoredFusion | null> {
  return new Promise(resolve => {
    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      resolve(null)
      return
    }
    chrome.storage.local.get(FUSION_STORAGE_KEY, result => {
      const raw = result?.[FUSION_STORAGE_KEY]
      if (raw && typeof raw === "object" && "result" in raw) {
        resolve(raw as StoredFusion)
      } else {
        resolve(null)
      }
    })
  })
}

function clearStoredFusion(): Promise<void> {
  return new Promise(resolve => {
    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      resolve()
      return
    }
    chrome.storage.local.remove(FUSION_STORAGE_KEY, () => resolve())
  })
}

const PipelineDiagram: React.FC<{ fusion: MoAFusionResult }> = ({ fusion }) => {
  return (
    <div className="flex flex-col md:flex-row items-stretch gap-3">
      <div className="flex-1 space-y-2">
        <div className="text-xs uppercase tracking-wide text-gray-400">Layer 1 — Proposers</div>
        {fusion.drafts.map(d => {
          const badge = STATUS_BADGES[d.status] || STATUS_BADGES.success
          return (
            <div
              key={`${d.provider}-${d.model_name}`}
              className="rounded-lg border border-gray-200 bg-white p-3 text-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-gray-900 truncate">{d.model_name}</div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${badge.className}`}>
                  {badge.label}
                </span>
              </div>
              <div className="mt-1 text-xs text-gray-500 flex items-center gap-3">
                <span>{d.provider}</span>
                <span>{formatMs(d.latency_ms)}</span>
                <span>{formatUsd(d.estimated_cost_usd)}</span>
              </div>
              {d.error && (
                <div className="mt-1 text-xs text-red-600 truncate">{d.error}</div>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-center text-gray-400 text-2xl px-2 select-none">
        →
      </div>

      <div className="flex-1 space-y-2">
        <div className="text-xs uppercase tracking-wide text-gray-400">Layer 2 — Aggregator</div>
        <div className="rounded-lg border border-gray-900 bg-gray-900 text-white p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="font-medium truncate">{fusion.aggregator.model_name}</div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-white/20">
              {formatMs(fusion.aggregator.latency_ms)}
            </span>
          </div>
          <div className="mt-1 text-xs text-white/70 flex items-center gap-3">
            <span>{fusion.aggregator.provider}</span>
            <span>{formatUsd(fusion.aggregator.estimated_cost_usd)}</span>
          </div>
        </div>
        <div className="rounded-lg border border-dashed border-gray-300 p-3 text-xs text-gray-500">
          Total: {formatMs(fusion.pipeline.total_latency_ms)} ·{" "}
          {formatUsd(fusion.pipeline.total_cost_usd)} · {fusion.pipeline.successful_proposers}/
          {fusion.pipeline.proposer_count} proposers
        </div>
      </div>
    </div>
  )
}

const ScoreBar: React.FC<{ value: number | null; max: number; highlight?: boolean }> = ({
  value,
  max,
  highlight,
}) => {
  const pct = value != null && max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full ${highlight ? "bg-gray-900" : "bg-gray-400"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

const ComparisonTable: React.FC<{ fusion: MoAFusionResult }> = ({ fusion }) => {
  const rows = [
    ...fusion.drafts.map(d => ({
      label: d.model_name,
      scores: d.scores,
      latency: d.latency_ms,
      cost: d.estimated_cost_usd,
      highlight: false,
    })),
    {
      label: "MoA Fused",
      scores: fusion.fused.scores,
      latency: fusion.pipeline.total_latency_ms,
      cost: fusion.pipeline.total_cost_usd,
      highlight: true,
    },
  ]

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b border-gray-200">
            <th className="py-2 pr-3 font-medium text-gray-600">Model</th>
            {SCORE_METRICS.map(m => (
              <th key={m.key} className="py-2 px-2 font-medium text-gray-600">
                {m.label}
              </th>
            ))}
            <th className="py-2 px-2 font-medium text-gray-600">Latency</th>
            <th className="py-2 pl-2 font-medium text-gray-600">Cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr
              key={r.label}
              className={`border-b border-gray-100 ${r.highlight ? "bg-gray-50 font-semibold" : ""}`}
            >
              <td className="py-2 pr-3 text-gray-900">{r.label}</td>
              {SCORE_METRICS.map(m => {
                const v = r.scores?.[m.key]
                const bs = bestSingle(fusion.drafts, m.key)
                const delta = r.highlight && bs != null && typeof v === "number" ? v - bs : null
                return (
                  <td key={m.key} className="py-2 px-2 text-gray-900">
                    {formatScore(v)}
                    {delta != null && (
                      <span
                        className={`ml-1 text-xs ${delta >= 0 ? "text-green-600" : "text-red-600"}`}
                      >
                        {delta >= 0 ? "↑" : "↓"}
                        {Math.abs(delta).toFixed(3)}
                      </span>
                    )}
                  </td>
                )
              })}
              <td className="py-2 px-2 text-gray-900">{formatMs(r.latency)}</td>
              <td className="py-2 pl-2 text-gray-900">{formatUsd(r.cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const ScoreChart: React.FC<{ fusion: MoAFusionResult }> = ({ fusion }) => {
  return (
    <div className="space-y-4">
      {SCORE_METRICS.map(metric => {
        const entries = [
          ...fusion.drafts.map(d => ({
            label: d.model_name,
            value: d.scores?.[metric.key] ?? null,
            highlight: false,
          })),
          {
            label: "MoA Fused",
            value: fusion.fused.scores?.[metric.key] ?? null,
            highlight: true,
          },
        ]
        const max = entries.reduce(
          (acc, e) => (typeof e.value === "number" && e.value > acc ? e.value : acc),
          0,
        )
        return (
          <div key={metric.key}>
            <div className="text-xs font-medium text-gray-600 mb-1">{metric.label}</div>
            <div className="space-y-1">
              {entries.map(e => (
                <div key={e.label} className="flex items-center gap-3">
                  <div className="w-40 truncate text-xs text-gray-700">{e.label}</div>
                  <div className="flex-1">
                    <ScoreBar value={e.value} max={max} highlight={e.highlight} />
                  </div>
                  <div className="w-16 text-right text-xs text-gray-500">
                    {formatScore(e.value)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const CostLatencyBreakdown: React.FC<{ fusion: MoAFusionResult }> = ({ fusion }) => {
  const proposerCost = fusion.drafts.reduce(
    (sum, d) => sum + (d.estimated_cost_usd ?? 0),
    0,
  )
  const aggregatorCost = fusion.aggregator.estimated_cost_usd ?? 0
  const totalCost = proposerCost + aggregatorCost

  const proposerPct = totalCost > 0 ? (proposerCost / totalCost) * 100 : 0
  const aggregatorPct = totalCost > 0 ? (aggregatorCost / totalCost) * 100 : 0

  const maxProposerLatency = Math.max(0, ...fusion.drafts.map(d => d.latency_ms || 0))

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm font-medium text-gray-900 mb-2">Cost breakdown</div>
        <div className="h-4 w-full rounded-full overflow-hidden bg-gray-100 flex">
          <div
            className="bg-gray-500 h-full"
            style={{ width: `${proposerPct}%` }}
            title={`Proposers: ${formatUsd(proposerCost)}`}
          />
          <div
            className="bg-gray-900 h-full"
            style={{ width: `${aggregatorPct}%` }}
            title={`Aggregator: ${formatUsd(aggregatorCost)}`}
          />
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-600 mt-2">
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 bg-gray-500 rounded" /> Proposers{" "}
            {formatUsd(proposerCost)}
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 bg-gray-900 rounded" /> Aggregator{" "}
            {formatUsd(aggregatorCost)}
          </div>
          <div className="ml-auto font-medium">Total {formatUsd(totalCost)}</div>
        </div>
      </div>

      <div>
        <div className="text-sm font-medium text-gray-900 mb-2">Latency timeline</div>
        <div className="space-y-1">
          {fusion.drafts.map(d => {
            const pct =
              maxProposerLatency > 0 ? (d.latency_ms / maxProposerLatency) * 100 : 0
            return (
              <div key={`${d.provider}-${d.model_name}`} className="flex items-center gap-3">
                <div className="w-40 truncate text-xs text-gray-700">{d.model_name}</div>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gray-400" style={{ width: `${pct}%` }} />
                </div>
                <div className="w-16 text-right text-xs text-gray-500">
                  {formatMs(d.latency_ms)}
                </div>
              </div>
            )
          })}
          <div className="flex items-center gap-3 pt-1">
            <div className="w-40 truncate text-xs text-gray-700">
              {fusion.aggregator.model_name} (agg)
            </div>
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gray-900"
                style={{
                  width: `${
                    fusion.pipeline.total_latency_ms > 0
                      ? (fusion.aggregator.latency_ms / fusion.pipeline.total_latency_ms) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
            <div className="w-16 text-right text-xs text-gray-500">
              {formatMs(fusion.aggregator.latency_ms)}
            </div>
          </div>
        </div>
        <div className="text-xs text-gray-500 mt-2">
          Proposers run in parallel → aggregator runs after. Total pipeline:{" "}
          {formatMs(fusion.pipeline.total_latency_ms)}.
        </div>
      </div>
    </div>
  )
}

const AggregatorInput: React.FC<{ fusion: MoAFusionResult }> = ({ fusion }) => {
  const [open, setOpen] = useState(false)
  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Xem drafts đưa vào aggregator
      </Button>
    )
  }
  return (
    <div className="space-y-3">
      <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Ẩn
      </Button>
      {fusion.drafts
        .filter(d => d.status === "success")
        .map(d => (
          <div
            key={`${d.provider}-${d.model_name}`}
            className="border border-gray-200 rounded-lg p-3"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-gray-900">{d.model_name}</span>
              <span className="text-xs text-gray-400">({d.provider})</span>
            </div>
            <pre className="text-xs text-gray-700 whitespace-pre-wrap break-words">
              {d.summary}
            </pre>
          </div>
        ))}
    </div>
  )
}

const DebugPage: React.FC = () => {
  const [stored, setStored] = useState<StoredFusion | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    loadStoredFusion().then(s => {
      if (cancelled) return
      setStored(s)
      setLoading(false)
    })

    const onChanged: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (
      changes,
      area,
    ) => {
      if (area !== "local") return
      const change = changes[FUSION_STORAGE_KEY]
      if (!change) return
      const next = change.newValue
      if (next && typeof next === "object" && "result" in next) {
        setStored(next as StoredFusion)
      } else {
        setStored(null)
      }
    }

    if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(onChanged)
    }

    const onMessage = (message: { type?: string; payload?: MoAFusionResult }) => {
      if (message?.type === "fiber:last-fusion" && message.payload) {
        setStored({
          result: message.payload,
          capturedAt: Date.now(),
        })
      }
    }
    if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(onMessage)
    }

    return () => {
      cancelled = true
      if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
        chrome.storage.onChanged.removeListener(onChanged)
      }
      if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
        chrome.runtime.onMessage.removeListener(onMessage)
      }
    }
  }, [])

  const fusion = stored?.result ?? null

  const capturedAt = useMemo(() => {
    if (!stored?.capturedAt) return null
    try {
      return new Date(stored.capturedAt).toLocaleString()
    } catch {
      return null
    }
  }, [stored?.capturedAt])

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Fiber — Debug</h1>
            <p className="text-sm text-gray-500 mt-1">
              Chi tiết pipeline Mixture-of-Agents cho lần tóm tắt gần nhất.
            </p>
          </div>
          {fusion && (
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                await clearStoredFusion()
                setStored(null)
              }}
            >
              Xoá dữ liệu
            </Button>
          )}
        </header>

        {loading ? (
          <Card>
            <p className="text-sm text-gray-500">Đang tải…</p>
          </Card>
        ) : !fusion ? (
          <Card>
            <h2 className="text-base font-semibold text-gray-900 mb-2">
              Chưa có dữ liệu fusion
            </h2>
            <p className="text-sm text-gray-600">
              Hãy mở một bài báo được hỗ trợ và chạy tóm tắt ở chế độ{" "}
              <span className="font-medium">Fusion (MoA)</span>. Trang này sẽ tự cập nhật khi có
              kết quả mới.
            </p>
          </Card>
        ) : (
          <>
            <Card>
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Pipeline</h2>
                  {capturedAt && (
                    <p className="text-xs text-gray-500 mt-0.5">Ghi lúc {capturedAt}</p>
                  )}
                  {stored?.articleTitle && (
                    <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xl">
                      {stored.articleTitle}
                    </p>
                  )}
                </div>
                <div className="text-right text-xs text-gray-500">
                  <div>routing_id:</div>
                  <div className="font-mono text-gray-700">
                    {fusion.routing_id || "—"}
                  </div>
                </div>
              </div>
              <PipelineDiagram fusion={fusion} />
              {fusion.pipeline.failed_proposers.length > 0 && (
                <div className="mt-3 text-xs text-red-600">
                  Failed proposers: {fusion.pipeline.failed_proposers.join(", ")}
                </div>
              )}
            </Card>

            <Card>
              <h2 className="text-base font-semibold text-gray-900 mb-3">
                So sánh điểm số
              </h2>
              <ComparisonTable fusion={fusion} />
            </Card>

            <Card>
              <h2 className="text-base font-semibold text-gray-900 mb-3">Biểu đồ chất lượng</h2>
              <ScoreChart fusion={fusion} />
            </Card>

            <Card>
              <h2 className="text-base font-semibold text-gray-900 mb-3">Chi phí & độ trễ</h2>
              <CostLatencyBreakdown fusion={fusion} />
            </Card>

            <Card>
              <h2 className="text-base font-semibold text-gray-900 mb-1">
                Bản tóm tắt fused
              </h2>
              <p className="text-xs text-gray-500 mb-3">
                {fusion.fused.category || "—"} ·{" "}
                {fusion.fused.readingTime ? `${fusion.fused.readingTime}m đọc` : "—"}
              </p>
              <p className="text-sm text-gray-900 leading-relaxed whitespace-pre-line">
                {fusion.fused.summary}
              </p>
            </Card>

            <Card>
              <h2 className="text-base font-semibold text-gray-900 mb-3">
                Input gửi vào aggregator
              </h2>
              <p className="text-xs text-gray-500 mb-3">
                Aggregator nhận bài viết gốc cộng với các draft thành công bên dưới (xem{" "}
                <code>buildAggregatorPrompt</code> ở backend để biết template đầy đủ).
              </p>
              <AggregatorInput fusion={fusion} />
            </Card>
          </>
        )}
      </div>
    </div>
  )
}

export default DebugPage
