import { NextRequest, NextResponse } from "next/server"
import { getCorsHeaders } from "@/middleware/cors"
import { getSupabaseAdmin } from "@/lib/supabase"

interface SummaryEntry {
  label: string
  hidden_mode?: string
  hidden_model?: string
  evaluation_metric_id?: string
}

export interface AxisCAggregate {
  task_id: string
  hidden_mode: string | null
  hidden_model: string | null
  n_raters: number
  avg_rank: number
  n_first: number
  pct_first: number
}

/**
 * POST /api/human-eval/by-metric-ids
 * Body: { metric_ids: string[] }
 *
 * For each evaluation_metrics.id provided, look up the matching
 * human_eval_tasks row (via summaries[].evaluation_metric_id), aggregate the
 * rank of THAT specific candidate across all responses, and return the
 * per-metric-id stats. Used by the metrics page to render the Axis C strip.
 *
 * Only fused / sync rows match (proposer drafts live in moa_draft_results,
 * not evaluation_metrics, so they don't carry a metric id).
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      metric_ids?: unknown
    }

    const metricIds = Array.isArray(body.metric_ids)
      ? (body.metric_ids.filter((x) => typeof x === "string") as string[])
      : []

    if (metricIds.length === 0) {
      return NextResponse.json({ data: {} }, { headers: getCorsHeaders() })
    }

    const supabase = getSupabaseAdmin()

    const { data: tasks, error: tasksErr } = await supabase
      .from("human_eval_tasks")
      .select("id, summaries")

    if (tasksErr) {
      throw new Error(`Failed to load tasks: ${tasksErr.message}`)
    }

    const wanted = new Set(metricIds)
    const metricToSlot = new Map<
      string,
      {
        task_id: string
        label: string
        hidden_mode: string | null
        hidden_model: string | null
      }
    >()
    const taskIds = new Set<string>()

    for (const t of tasks ?? []) {
      const summaries = (t.summaries ?? []) as SummaryEntry[]
      for (const s of summaries) {
        const mid = s.evaluation_metric_id
        if (mid && wanted.has(mid)) {
          metricToSlot.set(mid, {
            task_id: t.id,
            label: s.label,
            hidden_mode: s.hidden_mode ?? null,
            hidden_model: s.hidden_model ?? null,
          })
          taskIds.add(t.id)
        }
      }
    }

    if (taskIds.size === 0) {
      return NextResponse.json({ data: {} }, { headers: getCorsHeaders() })
    }

    const { data: responses, error: respErr } = await supabase
      .from("human_eval_responses")
      .select("task_id, rater_id, ranking")
      .in("task_id", Array.from(taskIds))

    if (respErr) {
      throw new Error(`Failed to load responses: ${respErr.message}`)
    }

    const byTask = new Map<string, string[][]>()
    for (const r of responses ?? []) {
      const arr = byTask.get(r.task_id) ?? []
      arr.push(r.ranking as string[])
      byTask.set(r.task_id, arr)
    }

    const out: Record<string, AxisCAggregate> = {}
    for (const [metricId, slot] of metricToSlot.entries()) {
      const rankings = byTask.get(slot.task_id) ?? []
      const ranks: number[] = []
      let nFirst = 0
      for (const ranking of rankings) {
        const idx = ranking.indexOf(slot.label)
        if (idx === -1) continue
        const rank = idx + 1
        ranks.push(rank)
        if (rank === 1) nFirst++
      }
      if (ranks.length === 0) continue
      const avgRank =
        Math.round((ranks.reduce((a, b) => a + b, 0) / ranks.length) * 100) /
        100
      out[metricId] = {
        task_id: slot.task_id,
        hidden_mode: slot.hidden_mode,
        hidden_model: slot.hidden_model,
        n_raters: ranks.length,
        avg_rank: avgRank,
        n_first: nFirst,
        pct_first: Math.round((nFirst / ranks.length) * 1000) / 10,
      }
    }

    return NextResponse.json({ data: out }, { headers: getCorsHeaders() })
  } catch (err) {
    console.error("[HumanEval] POST /by-metric-ids error:", err)
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load axis-C data",
      },
      { status: 500, headers: getCorsHeaders() },
    )
  }
}

export const dynamic = "force-dynamic"
