import { NextRequest, NextResponse } from "next/server"
import { getCorsHeaders } from "@/middleware/cors"
import { getSupabaseAdmin } from "@/lib/supabase"
import {
  HumanEvalResponseSchema,
  type HumanEvalSummary,
} from "@/domain/schemas"

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: getCorsHeaders() })
}

/**
 * POST /api/human-eval/respond
 * Submit a rater's blind-ranking response for a given task. Validates that
 * the ranking is a permutation of the task's labels and that every label has
 * a one-sentence rationale. The (task_id, rater_id) pair is unique, so a
 * second submission from the same rater is rejected.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = HumanEvalResponseSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400, headers: getCorsHeaders() },
      )
    }

    const { task_id, rater_id, ranking, rationale } = parsed.data
    const supabase = getSupabaseAdmin()

    const { data: task, error: taskErr } = await supabase
      .from("human_eval_tasks")
      .select("summaries")
      .eq("id", task_id)
      .single()

    if (taskErr || !task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404, headers: getCorsHeaders() },
      )
    }

    const taskLabels = (task.summaries as HumanEvalSummary[]).map((s) => s.label)
    const taskLabelSet = new Set(taskLabels)
    const rankingSet = new Set(ranking)

    if (
      ranking.length !== taskLabels.length ||
      rankingSet.size !== ranking.length ||
      [...rankingSet].some((l) => !taskLabelSet.has(l))
    ) {
      return NextResponse.json(
        { error: "Ranking must be a permutation of the task's labels" },
        { status: 400, headers: getCorsHeaders() },
      )
    }

    for (const label of taskLabels) {
      const sentence = rationale[label]
      if (typeof sentence !== "string" || sentence.trim().length === 0) {
        return NextResponse.json(
          { error: `Rationale missing for label '${label}'` },
          { status: 400, headers: getCorsHeaders() },
        )
      }
    }

    const { data, error } = await supabase
      .from("human_eval_responses")
      .insert({
        task_id,
        rater_id: rater_id.trim(),
        ranking,
        rationale,
      })
      .select("id")
      .single()

    if (error) {
      // Postgres unique-constraint violation → 409 so the rater UI can react.
      if ((error as { code?: string }).code === "23505") {
        return NextResponse.json(
          { error: "This rater has already submitted a response for this task" },
          { status: 409, headers: getCorsHeaders() },
        )
      }
      throw new Error(`Database error: ${error.message}`)
    }

    return NextResponse.json(
      { id: data?.id, success: true },
      { status: 201, headers: getCorsHeaders() },
    )
  } catch (err) {
    console.error("[HumanEval] POST /respond error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to submit response" },
      { status: 500, headers: getCorsHeaders() },
    )
  }
}
