import { NextRequest, NextResponse } from "next/server"
import { getCorsHeaders } from "@/middleware/cors"
import { getSupabaseAdmin } from "@/lib/supabase"
import {
  CreateHumanEvalTaskSchema,
  HumanEvalSummarySchema,
  type HumanEvalSummary,
  type HumanEvalTaskPublic,
} from "@/domain/schemas"

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: getCorsHeaders() })
}

/**
 * GET /api/human-eval?id=<uuid>
 *   Public rater view. Returns the task with `hidden_model`/`hidden_mode`
 *   stripped from each summary so raters cannot see which model produced
 *   which candidate. Returns 404 if no task with that id exists.
 *
 * GET /api/human-eval (no id)
 *   Admin listing. Returns all tasks with metadata + response counts so the
 *   admin page can pick one to review/export.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    const reveal = searchParams.get("reveal") === "1"

    if (id) {
      const { data, error } = await supabase
        .from("human_eval_tasks")
        .select("id, article_url, article_text, summaries, notes, created_at")
        .eq("id", id)
        .single()

      if (error || !data) {
        return NextResponse.json(
          { error: "Task not found" },
          { status: 404, headers: getCorsHeaders() },
        )
      }

      const summaries = (data.summaries as HumanEvalSummary[]).map((s) =>
        reveal ? s : { label: s.label, text: s.text },
      )

      const payload: HumanEvalTaskPublic = {
        id: data.id,
        article_url: data.article_url,
        article_text: data.article_text,
        summaries,
        notes: data.notes,
        created_at: data.created_at,
      }
      return NextResponse.json(payload, { headers: getCorsHeaders() })
    }

    // Admin listing — include response counts for the dashboard.
    const { data: tasks, error } = await supabase
      .from("human_eval_tasks")
      .select("id, article_url, summaries, notes, created_at")
      .order("created_at", { ascending: false })

    if (error) throw new Error(`Database error: ${error.message}`)

    const taskList = tasks ?? []
    if (taskList.length === 0) {
      return NextResponse.json({ tasks: [] }, { headers: getCorsHeaders() })
    }

    const taskIds = taskList.map((t) => t.id as string)
    const { data: responses } = await supabase
      .from("human_eval_responses")
      .select("task_id, rater_id")
      .in("task_id", taskIds)

    const respByTask = new Map<string, Set<string>>()
    for (const r of responses ?? []) {
      const tid = r.task_id as string
      const rid = r.rater_id as string
      if (!respByTask.has(tid)) respByTask.set(tid, new Set())
      respByTask.get(tid)!.add(rid)
    }

    const out = taskList.map((t) => {
      const summaries = t.summaries as HumanEvalSummary[]
      return {
        id: t.id,
        article_url: t.article_url,
        notes: t.notes,
        created_at: t.created_at,
        labels: summaries.map((s) => s.label),
        candidate_count: summaries.length,
        rater_count: respByTask.get(t.id as string)?.size ?? 0,
      }
    })

    return NextResponse.json({ tasks: out }, { headers: getCorsHeaders() })
  } catch (err) {
    console.error("[HumanEval] GET error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load task(s)" },
      { status: 500, headers: getCorsHeaders() },
    )
  }
}

/**
 * POST /api/human-eval
 * Admin task creation. Validates the bundle, ensures labels are unique, and
 * inserts a row into `human_eval_tasks`. Returns the new id + a shareable URL.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = CreateHumanEvalTaskSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400, headers: getCorsHeaders() },
      )
    }

    const summaries = parsed.data.summaries
    const labels = summaries.map((s) => s.label)
    if (new Set(labels).size !== labels.length) {
      return NextResponse.json(
        { error: "Summary labels must be unique within a task" },
        { status: 400, headers: getCorsHeaders() },
      )
    }

    // Re-parse each summary to drop unknown keys.
    const cleanedSummaries = summaries.map((s) => HumanEvalSummarySchema.parse(s))

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from("human_eval_tasks")
      .insert({
        article_url: parsed.data.article_url,
        article_text: parsed.data.article_text,
        summaries: cleanedSummaries,
        notes: parsed.data.notes ?? null,
      })
      .select("id")
      .single()

    if (error || !data) {
      throw new Error(`Database error: ${error?.message ?? "insert returned no row"}`)
    }

    const origin = request.nextUrl.origin
    const share_url = `${origin}/evaluate?task=${data.id}`

    return NextResponse.json(
      { id: data.id, share_url },
      { status: 201, headers: getCorsHeaders() },
    )
  } catch (err) {
    console.error("[HumanEval] POST error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create task" },
      { status: 500, headers: getCorsHeaders() },
    )
  }
}
