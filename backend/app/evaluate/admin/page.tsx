"use client"

import { useEffect, useState } from "react"

// ─── Types (mirrors HumanEvalSummarySchema) ──────────────────────────────────
interface AdminSummary {
  label: string
  text: string
  hidden_model?: string
  hidden_mode?: string
  evaluation_metric_id?: string
}

interface TaskListItem {
  id: string
  article_url: string
  notes?: string | null
  created_at: string
  labels: string[]
  candidate_count: number
  rater_count: number
}

interface RankingAggregate {
  label: string
  hidden_model?: string
  hidden_mode?: string
  avg_rank: number
  win_rate: number
  rater_count: number
}

interface ResponseRow {
  id: string
  rater_id: string
  ranking: string[]
  rationale: Record<string, string>
  created_at: string
}

interface ReportPayload {
  task: {
    id: string
    article_url: string
    notes?: string | null
    created_at: string
    summaries: AdminSummary[]
  }
  aggregates: RankingAggregate[]
  fleiss_kappa: number | null
  rater_count: number
  responses: ResponseRow[]
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function HumanEvalAdminPage() {
  const [tab, setTab] = useState<"create" | "review">("create")

  return (
    <div className="max-w-6xl mx-auto p-8 space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Human-eval admin</h1>
        <p className="text-gray-600 text-sm">
          Tạo nhiệm vụ xếp hạng mù mới, xem kết quả tổng hợp và xuất CSV cho
          phụ lục luận văn.
        </p>
      </header>

      <div className="flex gap-2 border-b border-gray-200">
        <TabButton active={tab === "create"} onClick={() => setTab("create")}>
          Tạo nhiệm vụ
        </TabButton>
        <TabButton active={tab === "review"} onClick={() => setTab("review")}>
          Xem báo cáo
        </TabButton>
      </div>

      {tab === "create" ? <CreateTaskForm /> : <ReviewTab />}
    </div>
  )
}

function TabButton(props: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={props.onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        props.active
          ? "border-black text-black"
          : "border-transparent text-gray-500 hover:text-gray-800"
      }`}
    >
      {props.children}
    </button>
  )
}

// ─── Create-task tab ────────────────────────────────────────────────────────

function emptySummary(label: string): AdminSummary {
  return { label, text: "", hidden_model: "", hidden_mode: "" }
}

function CreateTaskForm() {
  const [articleUrl, setArticleUrl] = useState("")
  const [articleText, setArticleText] = useState("")
  const [notes, setNotes] = useState("")
  const [summaries, setSummaries] = useState<AdminSummary[]>([
    emptySummary("A"),
    emptySummary("B"),
    emptySummary("C"),
  ])
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState<{ id: string; share_url: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  function updateSummary(idx: number, patch: Partial<AdminSummary>) {
    setSummaries((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }
  function addSummary() {
    if (summaries.length >= 10) return
    const nextLabel = String.fromCharCode("A".charCodeAt(0) + summaries.length)
    setSummaries((prev) => [...prev, emptySummary(nextLabel)])
  }
  function removeSummary(idx: number) {
    if (summaries.length <= 2) return
    setSummaries((prev) => prev.filter((_, i) => i !== idx))
  }

  async function fetchFromMetrics() {
    if (!articleUrl.trim()) {
      setError("Cần nhập URL bài để lấy bản tóm tắt từ DB.")
      return
    }
    setError(null)
    try {
      const res = await fetch(
        `/api/metrics?url=${encodeURIComponent(articleUrl.trim())}&limit=20`,
      )
      if (!res.ok) {
        setError(`Lấy metrics thất bại (${res.status})`)
        return
      }
      const body = await res.json()
      // /api/metrics default view returns { metrics: [...] } — guard both shapes.
      const rows = (body.metrics ?? body.data ?? []) as Array<{
        id: string
        model?: string
        mode?: string
        summary?: string
      }>
      if (rows.length === 0) {
        setError(`Không có bản tóm tắt nào trong DB cho URL này.`)
        return
      }
      const next: AdminSummary[] = rows.slice(0, 10).map((r, i) => ({
        label: String.fromCharCode("A".charCodeAt(0) + i),
        text: r.summary ?? "",
        hidden_model: r.model,
        hidden_mode: r.mode,
        evaluation_metric_id: r.id,
      }))
      setSummaries(next.length >= 2 ? next : [...next, emptySummary("B")])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tải metrics")
    }
  }

  const labelsOk = new Set(summaries.map((s) => s.label)).size === summaries.length
  const textsOk = summaries.every((s) => s.text.trim().length > 0)
  const canSubmit =
    articleUrl.trim().length > 0 &&
    articleText.trim().length > 0 &&
    summaries.length >= 2 &&
    labelsOk &&
    textsOk &&
    !submitting

  async function onSubmit() {
    setSubmitting(true)
    setError(null)
    setCreated(null)
    try {
      const res = await fetch("/api/human-eval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          article_url: articleUrl.trim(),
          article_text: articleText.trim(),
          notes: notes.trim() || undefined,
          summaries: summaries.map((s) => ({
            label: s.label.trim(),
            text: s.text.trim(),
            hidden_model: s.hidden_model?.trim() || undefined,
            hidden_mode: s.hidden_mode?.trim() || undefined,
            evaluation_metric_id: s.evaluation_metric_id || undefined,
          })),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body?.error ?? `Tạo task thất bại (${res.status})`)
        return
      }
      const body = (await res.json()) as { id: string; share_url: string }
      setCreated(body)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi mạng")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <h2 className="font-semibold">Bài gốc</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            URL bài
          </label>
          <input
            type="text"
            value={articleUrl}
            onChange={(e) => setArticleUrl(e.target.value)}
            placeholder="https://tienphong.vn/..."
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono"
          />
          <button
            type="button"
            onClick={fetchFromMetrics}
            className="mt-2 text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50"
          >
            Lấy bản tóm tắt từ DB cho URL này
          </button>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nội dung bài (full text)
          </label>
          <textarea
            value={articleText}
            onChange={(e) => setArticleText(e.target.value)}
            rows={6}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Ghi chú cho rater (tuỳ chọn)
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            placeholder="vd: Đợt 1 — bài thời sự"
          />
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Bản tóm tắt ({summaries.length})</h2>
          <button
            type="button"
            onClick={addSummary}
            disabled={summaries.length >= 10}
            className="text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            + Thêm bản
          </button>
        </div>
        {!labelsOk && (
          <p className="text-xs text-red-600">
            Nhãn (label) bị trùng — mỗi bản phải có nhãn riêng.
          </p>
        )}
        <ul className="space-y-3">
          {summaries.map((s, idx) => (
            <li
              key={idx}
              className="border border-gray-200 rounded p-3 space-y-2"
            >
              <div className="flex flex-wrap gap-2 items-center">
                <input
                  type="text"
                  value={s.label}
                  onChange={(e) => updateSummary(idx, { label: e.target.value })}
                  className="w-12 text-center font-bold border border-gray-300 rounded px-1 py-1"
                  maxLength={4}
                />
                <input
                  type="text"
                  value={s.hidden_model ?? ""}
                  onChange={(e) =>
                    updateSummary(idx, { hidden_model: e.target.value })
                  }
                  placeholder="hidden_model (vd: gpt-4o)"
                  className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
                />
                <input
                  type="text"
                  value={s.hidden_mode ?? ""}
                  onChange={(e) =>
                    updateSummary(idx, { hidden_mode: e.target.value })
                  }
                  placeholder="hidden_mode (vd: fusion)"
                  className="w-40 border border-gray-300 rounded px-2 py-1 text-sm"
                />
                <button
                  type="button"
                  onClick={() => removeSummary(idx)}
                  disabled={summaries.length <= 2}
                  className="text-xs text-red-600 disabled:opacity-30 hover:underline"
                >
                  xoá
                </button>
              </div>
              <textarea
                value={s.text}
                onChange={(e) => updateSummary(idx, { text: e.target.value })}
                rows={3}
                placeholder="Nội dung tóm tắt"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
              {s.evaluation_metric_id && (
                <p className="text-[10px] text-gray-400 font-mono">
                  evaluation_metric_id = {s.evaluation_metric_id}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={onSubmit}
        disabled={!canSubmit}
        className={`px-6 py-2.5 rounded-lg font-medium text-white ${
          canSubmit ? "bg-black hover:bg-gray-800" : "bg-gray-300 cursor-not-allowed"
        }`}
      >
        {submitting ? "Đang tạo…" : "Tạo nhiệm vụ"}
      </button>

      {created && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium text-green-900">Đã tạo nhiệm vụ.</p>
          <p className="text-sm text-gray-700">
            ID: <code className="font-mono">{created.id}</code>
          </p>
          <p className="text-sm text-gray-700">Liên kết chia sẻ cho rater:</p>
          <code className="block text-xs bg-white border border-gray-200 rounded p-2 break-all">
            {created.share_url}
          </code>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(created.share_url)}
            className="text-xs px-3 py-1 border border-gray-300 rounded hover:bg-gray-50"
          >
            Copy
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Review tab ─────────────────────────────────────────────────────────────

function ReviewTab() {
  const [tasks, setTasks] = useState<TaskListItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [report, setReport] = useState<ReportPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch("/api/human-eval")
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.error ?? `Request failed (${res.status})`)
        }
        const body = (await res.json()) as { tasks: TaskListItem[] }
        setTasks(body.tasks)
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Lỗi tải danh sách"),
      )
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedId) return
    setReport(null)
    setError(null)
    fetch(`/api/human-eval/report?id=${encodeURIComponent(selectedId)}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.error ?? `Request failed (${res.status})`)
        }
        const body = (await res.json()) as ReportPayload
        setReport(body)
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Lỗi tải báo cáo"))
  }, [selectedId])

  return (
    <div className="grid grid-cols-12 gap-6">
      <aside className="col-span-4 space-y-2">
        <h2 className="font-semibold mb-2">Nhiệm vụ đã tạo</h2>
        {loading && <p className="text-sm text-gray-500">Đang tải…</p>}
        {!loading && tasks.length === 0 && (
          <p className="text-sm text-gray-500">Chưa có nhiệm vụ nào.</p>
        )}
        <ul className="space-y-1">
          {tasks.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => setSelectedId(t.id)}
                className={`w-full text-left p-3 rounded border transition-colors ${
                  selectedId === t.id
                    ? "border-black bg-gray-50"
                    : "border-gray-200 hover:border-gray-400"
                }`}
              >
                <p className="text-xs font-mono text-gray-500 truncate">
                  {t.article_url}
                </p>
                <p className="text-xs text-gray-700 mt-1">
                  {t.candidate_count} bản · {t.rater_count} rater
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {new Date(t.created_at).toLocaleString()}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <main className="col-span-8 space-y-4">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!selectedId && !error && (
          <p className="text-sm text-gray-500">
            Chọn một nhiệm vụ ở cột bên trái để xem báo cáo.
          </p>
        )}
        {selectedId && !report && !error && (
          <p className="text-sm text-gray-500">Đang tải báo cáo…</p>
        )}
        {report && <ReportView payload={report} />}
      </main>
    </div>
  )
}

function kappaBand(k: number): { label: string; color: string } {
  if (k < 0) return { label: "poor", color: "text-red-600" }
  if (k <= 0.2) return { label: "slight", color: "text-orange-600" }
  if (k <= 0.4) return { label: "fair", color: "text-yellow-700" }
  if (k <= 0.6) return { label: "moderate", color: "text-green-700" }
  if (k <= 0.8) return { label: "substantial", color: "text-green-800" }
  return { label: "almost perfect", color: "text-emerald-800" }
}

function ReportView({ payload }: { payload: ReportPayload }) {
  const k = payload.fleiss_kappa
  const sortedAgg = [...payload.aggregates].sort(
    (a, b) => a.avg_rank - b.avg_rank,
  )
  const exportUrl = `/api/human-eval/export?id=${payload.task.id}`
  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/evaluate?task=${payload.task.id}`
      : `/evaluate?task=${payload.task.id}`

  return (
    <div className="space-y-5">
      <section className="bg-white border border-gray-200 rounded-lg p-5">
        <p className="text-xs font-mono text-gray-500 break-all">
          {payload.task.article_url}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          Tạo lúc: {new Date(payload.task.created_at).toLocaleString()} ·{" "}
          {payload.rater_count} rater
        </p>
        <div className="mt-3 flex gap-2 flex-wrap">
          <a
            href={shareUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50"
          >
            Mở trang rater
          </a>
          <a
            href={exportUrl}
            className="text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50"
          >
            Tải CSV
          </a>
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="font-semibold">Tổng hợp</h3>
          <p className="text-sm">
            Fleiss&apos; κ:{" "}
            {k === null ? (
              <span className="text-gray-400">—</span>
            ) : (
              <span className={`font-mono ${kappaBand(k).color}`}>
                {k.toFixed(3)} ({kappaBand(k).label})
              </span>
            )}
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500">
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 font-medium">Label</th>
              <th className="text-left py-2 font-medium">Hidden model</th>
              <th className="text-left py-2 font-medium">Hidden mode</th>
              <th className="text-right py-2 font-medium">Avg rank</th>
              <th className="text-right py-2 font-medium">Win rate</th>
              <th className="text-right py-2 font-medium">N</th>
            </tr>
          </thead>
          <tbody>
            {sortedAgg.map((a) => (
              <tr key={a.label} className="border-b border-gray-100 last:border-0">
                <td className="py-2 font-bold">{a.label}</td>
                <td className="py-2 font-mono text-xs text-gray-700">
                  {a.hidden_model ?? "—"}
                </td>
                <td className="py-2 font-mono text-xs text-gray-700">
                  {a.hidden_mode ?? "—"}
                </td>
                <td className="py-2 text-right font-mono">
                  {a.rater_count > 0 ? a.avg_rank.toFixed(2) : "—"}
                </td>
                <td className="py-2 text-right font-mono">
                  {a.rater_count > 0 ? `${(a.win_rate * 100).toFixed(0)}%` : "—"}
                </td>
                <td className="py-2 text-right font-mono">{a.rater_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {payload.rater_count < 2 && (
          <p className="mt-3 text-xs text-gray-500">
            Cần ít nhất 2 đánh giá viên để tính Fleiss&apos; κ.
          </p>
        )}
      </section>

      <section className="bg-white border border-gray-200 rounded-lg p-5">
        <h3 className="font-semibold mb-3">Câu trả lời thô ({payload.responses.length})</h3>
        {payload.responses.length === 0 && (
          <p className="text-sm text-gray-500">Chưa có rater nào trả lời.</p>
        )}
        <ul className="space-y-3">
          {payload.responses.map((r) => (
            <li key={r.id} className="border border-gray-100 rounded p-3">
              <div className="flex justify-between text-xs text-gray-500 mb-2">
                <span className="font-mono">{r.rater_id}</span>
                <span>{new Date(r.created_at).toLocaleString()}</span>
              </div>
              <p className="text-sm">
                Ranking:{" "}
                <span className="font-mono">{r.ranking.join(" > ")}</span>
              </p>
              <ul className="mt-2 space-y-1 text-xs">
                {r.ranking.map((label) => (
                  <li key={label}>
                    <strong>{label}:</strong>{" "}
                    <span className="text-gray-700">{r.rationale[label]}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export const dynamic = "force-dynamic"
