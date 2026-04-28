import { NextRequest, NextResponse } from "next/server"
import { getCorsHeaders } from "@/middleware/cors"
import { getSupabaseAdmin } from "@/lib/supabase"
import type { HumanEvalSummary } from "@/domain/schemas"

/**
 * GET /api/human-eval/export?id=<task-id>
 * Streams the raw rater responses for a task as CSV with the hidden model +
 * mode columns revealed. One row per (rater, label) with columns:
 *   task_id, rater_id, label, rank, hidden_model, hidden_mode, rationale,
 *   submitted_at
 *
 * Used by the thesis appendix.
 */

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ""
  const s = String(value)
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    if (!id) {
      return NextResponse.json(
        { error: "Missing required query param: id" },
        { status: 400, headers: getCorsHeaders() },
      )
    }

    const supabase = getSupabaseAdmin()
    const { data: task, error: taskErr } = await supabase
      .from("human_eval_tasks")
      .select("id, article_url, summaries")
      .eq("id", id)
      .single()

    if (taskErr || !task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404, headers: getCorsHeaders() },
      )
    }

    const summaries = task.summaries as HumanEvalSummary[]
    const hiddenByLabel = new Map<
      string,
      { hidden_model?: string; hidden_mode?: string }
    >()
    for (const s of summaries) {
      hiddenByLabel.set(s.label, {
        hidden_model: s.hidden_model,
        hidden_mode: s.hidden_mode,
      })
    }

    const { data: respRows, error: respErr } = await supabase
      .from("human_eval_responses")
      .select("rater_id, ranking, rationale, created_at")
      .eq("task_id", id)
      .order("created_at", { ascending: true })

    if (respErr) throw new Error(`Database error: ${respErr.message}`)

    const header = [
      "task_id",
      "article_url",
      "rater_id",
      "label",
      "rank",
      "hidden_model",
      "hidden_mode",
      "rationale",
      "submitted_at",
    ]
    const rows: string[] = [header.join(",")]

    for (const r of respRows ?? []) {
      const ranking = r.ranking as string[]
      const rationale = r.rationale as Record<string, string>
      ranking.forEach((label, idx) => {
        const hidden = hiddenByLabel.get(label) ?? {}
        rows.push(
          [
            csvEscape(task.id),
            csvEscape(task.article_url),
            csvEscape(r.rater_id),
            csvEscape(label),
            csvEscape(idx + 1),
            csvEscape(hidden.hidden_model),
            csvEscape(hidden.hidden_mode),
            csvEscape(rationale[label] ?? ""),
            csvEscape(r.created_at as string),
          ].join(","),
        )
      })
    }

    const body = rows.join("\n")
    return new NextResponse(body, {
      status: 200,
      headers: {
        ...getCorsHeaders(),
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="human-eval-${task.id}.csv"`,
      },
    })
  } catch (err) {
    console.error("[HumanEval] GET /export error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to export" },
      { status: 500, headers: getCorsHeaders() },
    )
  }
}

export const dynamic = "force-dynamic"
