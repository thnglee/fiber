import { NextRequest, NextResponse } from "next/server"
import { getCorsHeaders } from "@/middleware/cors"
import { getSupabaseAdmin } from "@/lib/supabase"
import {
  aggregateRankings,
  fleissKappaFromRankings,
} from "@/output-fusion/scripts/stats"
import type { HumanEvalSummary } from "@/domain/schemas"

interface ResponseRow {
  id: string
  rater_id: string
  ranking: string[]
  rationale: Record<string, string>
  created_at: string
}

/**
 * GET /api/human-eval/report?id=<task-id>
 * Aggregate report for a single task: per-label averages + win rate (with
 * the hidden model + mode revealed), Fleiss' κ across raters, and the raw
 * responses for the admin view. Returns 404 if no task with that id exists.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json(
        { error: "Missing required query param: id" },
        { status: 400, headers: getCorsHeaders() },
      )
    }

    const { data: task, error: taskErr } = await supabase
      .from("human_eval_tasks")
      .select("id, article_url, summaries, notes, created_at")
      .eq("id", id)
      .single()

    if (taskErr || !task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404, headers: getCorsHeaders() },
      )
    }

    const summaries = task.summaries as HumanEvalSummary[]
    const hiddenLookup: Record<
      string,
      { hidden_model?: string; hidden_mode?: string }
    > = {}
    for (const s of summaries) {
      hiddenLookup[s.label] = {
        hidden_model: s.hidden_model,
        hidden_mode: s.hidden_mode,
      }
    }

    const { data: respRows, error: respErr } = await supabase
      .from("human_eval_responses")
      .select("id, rater_id, ranking, rationale, created_at")
      .eq("task_id", id)
      .order("created_at", { ascending: true })

    if (respErr) {
      throw new Error(`Database error: ${respErr.message}`)
    }

    const responses = (respRows ?? []) as ResponseRow[]
    const rankings = responses.map((r) => r.ranking)

    const aggregates =
      rankings.length === 0
        ? summaries.map((s) => ({
            label: s.label,
            hidden_model: s.hidden_model,
            hidden_mode: s.hidden_mode,
            avg_rank: 0,
            win_rate: 0,
            rater_count: 0,
          }))
        : aggregateRankings(rankings, hiddenLookup)

    const kappa = rankings.length >= 2 ? fleissKappaFromRankings(rankings) : null

    return NextResponse.json(
      {
        task: {
          id: task.id,
          article_url: task.article_url,
          notes: task.notes,
          created_at: task.created_at,
          summaries,
        },
        aggregates,
        fleiss_kappa: kappa === null || Number.isNaN(kappa) ? null : kappa,
        rater_count: new Set(responses.map((r) => r.rater_id)).size,
        responses,
      },
      { headers: getCorsHeaders() },
    )
  } catch (err) {
    console.error("[HumanEval] GET /report error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load report" },
      { status: 500, headers: getCorsHeaders() },
    )
  }
}

export const dynamic = "force-dynamic"
