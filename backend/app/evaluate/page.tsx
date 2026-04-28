"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"

// ─── Types (locally mirrored to keep this page client-side and zero-import) ──
interface PublicSummary {
  label: string
  text: string
}

interface PublicTask {
  id: string
  article_url: string
  article_text: string
  summaries: PublicSummary[]
  notes?: string | null
}

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "missing-id" }
  | { kind: "not-found" }
  | { kind: "error"; message: string }
  | { kind: "ready"; task: PublicTask }

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "done" }
  | { kind: "duplicate" }
  | { kind: "error"; message: string }

// ─── Page ────────────────────────────────────────────────────────────────────

export default function EvaluatePage() {
  // useSearchParams requires a Suspense boundary in the App Router.
  return (
    <Suspense
      fallback={
        <div className="max-w-2xl mx-auto p-8">
          <p className="text-gray-500">Đang tải nhiệm vụ…</p>
        </div>
      }
    >
      <EvaluatePageInner />
    </Suspense>
  )
}

function EvaluatePageInner() {
  const params = useSearchParams()
  const taskId = params.get("task")

  const [state, setState] = useState<LoadState>({ kind: "idle" })
  const [order, setOrder] = useState<string[]>([])
  const [rationale, setRationale] = useState<Record<string, string>>({})
  const [raterId, setRaterId] = useState("")
  const [submit, setSubmit] = useState<SubmitState>({ kind: "idle" })

  useEffect(() => {
    if (!taskId) {
      setState({ kind: "missing-id" })
      return
    }
    setState({ kind: "loading" })
    fetch(`/api/human-eval?id=${encodeURIComponent(taskId)}`)
      .then(async (res) => {
        if (res.status === 404) {
          setState({ kind: "not-found" })
          return
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          setState({
            kind: "error",
            message: body?.error ?? `Request failed (${res.status})`,
          })
          return
        }
        const body = (await res.json()) as PublicTask
        // Initial order = label order as returned by the API. Rater can re-order.
        const initOrder = body.summaries.map((s) => s.label)
        setOrder(initOrder)
        setRationale(Object.fromEntries(initOrder.map((l) => [l, ""])))
        setState({ kind: "ready", task: body })
      })
      .catch((err) =>
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Network error",
        }),
      )
  }, [taskId])

  if (state.kind === "missing-id") {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <h1 className="text-2xl font-bold mb-4">Đánh giá tóm tắt</h1>
        <p className="text-gray-700">
          Liên kết không có ID nhiệm vụ. Vui lòng dùng đường dẫn được người
          tổ chức cung cấp (dạng <code>/evaluate?task=...</code>).
        </p>
      </div>
    )
  }
  if (state.kind === "not-found") {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <h1 className="text-2xl font-bold mb-4">Đánh giá tóm tắt</h1>
        <p className="text-gray-700">
          Không tìm thấy nhiệm vụ với mã <code>{taskId}</code>. Liên kết có
          thể đã bị xóa hoặc nhập sai.
        </p>
      </div>
    )
  }
  if (state.kind === "error") {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <h1 className="text-2xl font-bold mb-4">Lỗi</h1>
        <p className="text-red-600">{state.message}</p>
      </div>
    )
  }
  if (state.kind === "loading" || state.kind === "idle") {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <p className="text-gray-500">Đang tải nhiệm vụ…</p>
      </div>
    )
  }

  const task = state.task
  const summariesByLabel = new Map(task.summaries.map((s) => [s.label, s]))

  const allRationaleFilled = order.every(
    (lbl) => (rationale[lbl] ?? "").trim().length > 0,
  )
  const canSubmit =
    raterId.trim().length > 0 &&
    allRationaleFilled &&
    submit.kind !== "submitting"

  async function onSubmit() {
    setSubmit({ kind: "submitting" })
    try {
      const res = await fetch("/api/human-eval/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_id: task.id,
          rater_id: raterId.trim(),
          ranking: order,
          rationale,
        }),
      })
      if (res.status === 409) {
        setSubmit({ kind: "duplicate" })
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setSubmit({
          kind: "error",
          message: body?.error ?? `Request failed (${res.status})`,
        })
        return
      }
      setSubmit({ kind: "done" })
    } catch (err) {
      setSubmit({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      })
    }
  }

  if (submit.kind === "done") {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <h1 className="text-2xl font-bold mb-4">Cảm ơn bạn!</h1>
        <p className="text-gray-700">
          Đánh giá đã được lưu. Bạn có thể đóng tab này.
        </p>
      </div>
    )
  }
  if (submit.kind === "duplicate") {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <h1 className="text-2xl font-bold mb-4">Đã ghi nhận trước đó</h1>
        <p className="text-gray-700">
          Mã đánh giá viên <strong>{raterId}</strong> đã gửi câu trả lời cho
          nhiệm vụ này. Mỗi đánh giá viên chỉ trả lời một lần. Nếu cần sửa,
          hãy liên hệ người tổ chức.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-6">
      <header>
        <h1 className="text-3xl font-bold mb-2">Đánh giá tóm tắt (mù)</h1>
        <p className="text-gray-700 text-sm">
          Đọc bài gốc bên dưới, sau đó <strong>kéo thả</strong> (hoặc dùng
          mũi tên) để xếp các bản tóm tắt từ <em>tốt nhất</em> đến <em>kém
          nhất</em>. Mỗi bản viết một câu giải thích ngắn.
        </p>
        {task.notes && (
          <p className="mt-2 text-sm bg-yellow-50 border border-yellow-200 rounded p-3">
            <strong>Ghi chú từ người tổ chức:</strong> {task.notes}
          </p>
        )}
      </header>

      <section className="bg-white border border-gray-200 rounded-lg shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Bài gốc</h2>
          <a
            href={task.article_url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-600 hover:underline break-all"
          >
            {task.article_url}
          </a>
        </div>
        <div className="px-5 py-4 max-h-96 overflow-y-auto whitespace-pre-wrap text-sm text-gray-800 leading-relaxed">
          {task.article_text}
        </div>
      </section>

      <section>
        <h2 className="font-semibold text-gray-900 mb-3">Xếp hạng</h2>
        <RankingList
          order={order}
          summariesByLabel={summariesByLabel}
          rationale={rationale}
          onReorder={setOrder}
          onRationaleChange={(label, text) =>
            setRationale((prev) => ({ ...prev, [label]: text }))
          }
        />
      </section>

      <section className="border-t border-gray-200 pt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Mã đánh giá viên <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={raterId}
            onChange={(e) => setRaterId(e.target.value)}
            placeholder="email hoặc nickname (vd: thang@uet)"
            className="w-full max-w-md border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">
            Dùng để phân biệt giữa các đánh giá viên. Mỗi mã chỉ gửi được một
            lần cho mỗi nhiệm vụ.
          </p>
        </div>

        {submit.kind === "error" && (
          <p className="text-sm text-red-600">Lỗi: {submit.message}</p>
        )}

        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className={`px-6 py-2.5 rounded-lg font-medium text-white transition-colors ${
            canSubmit
              ? "bg-black hover:bg-gray-800"
              : "bg-gray-300 cursor-not-allowed"
          }`}
        >
          {submit.kind === "submitting" ? "Đang gửi…" : "Gửi đánh giá"}
        </button>
        {!allRationaleFilled && (
          <p className="text-xs text-gray-500">
            Cần điền đủ một câu giải thích cho mỗi bản tóm tắt trước khi gửi.
          </p>
        )}
      </section>
    </div>
  )
}

// ─── Drag-drop ranking widget ───────────────────────────────────────────────

interface RankingListProps {
  order: string[]
  summariesByLabel: Map<string, PublicSummary>
  rationale: Record<string, string>
  onReorder: (next: string[]) => void
  onRationaleChange: (label: string, text: string) => void
}

function RankingList({
  order,
  summariesByLabel,
  rationale,
  onReorder,
  onRationaleChange,
}: RankingListProps) {
  const dragFrom = useRef<number | null>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  function move(from: number, to: number) {
    if (from === to || to < 0 || to >= order.length) return
    const next = [...order]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    onReorder(next)
  }

  return (
    <ul className="space-y-3">
      {order.map((label, idx) => {
        const summary = summariesByLabel.get(label)
        if (!summary) return null
        const isHovered = hoverIndex === idx
        return (
          <li
            key={label}
            draggable
            onDragStart={() => {
              dragFrom.current = idx
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setHoverIndex(idx)
            }}
            onDragLeave={() => setHoverIndex(null)}
            onDrop={(e) => {
              e.preventDefault()
              const from = dragFrom.current
              dragFrom.current = null
              setHoverIndex(null)
              if (from !== null) move(from, idx)
            }}
            className={`bg-white border rounded-lg p-4 transition-all ${
              isHovered
                ? "border-blue-400 shadow-md"
                : "border-gray-200 shadow-sm"
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="flex flex-col items-center pt-1 select-none">
                <span className="text-xs font-mono text-gray-500">#{idx + 1}</span>
                <span className="text-2xl font-bold text-gray-900 mt-0.5">
                  {label}
                </span>
                <button
                  type="button"
                  onClick={() => move(idx, idx - 1)}
                  disabled={idx === 0}
                  aria-label="Move up"
                  className="text-xs text-gray-500 hover:text-black disabled:opacity-30 mt-2"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => move(idx, idx + 1)}
                  disabled={idx === order.length - 1}
                  aria-label="Move down"
                  className="text-xs text-gray-500 hover:text-black disabled:opacity-30"
                >
                  ▼
                </button>
                <span
                  className="text-gray-400 cursor-grab text-xs mt-2 select-none"
                  title="Kéo để sắp xếp"
                >
                  ⋮⋮
                </span>
              </div>

              <div className="flex-1 space-y-3">
                <div className="text-sm whitespace-pre-wrap text-gray-800 leading-relaxed">
                  {summary.text}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Một câu giải thích đánh giá của bạn cho bản {label}:
                  </label>
                  <textarea
                    value={rationale[label] ?? ""}
                    onChange={(e) => onRationaleChange(label, e.target.value)}
                    rows={2}
                    placeholder="vd: Bao quát đủ ý chính nhưng dài hơn cần thiết."
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export const dynamic = "force-dynamic"