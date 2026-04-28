import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getCorsHeaders } from "@/middleware/cors"
import { getSupabaseAdmin } from "@/lib/supabase"
import {
  JudgeModeSchema,
  JudgeStyleSchema,
  type JudgeConfig,
} from "@/domain/schemas"

const UpdateJudgeSchema = z
  .object({
    judge_mode: JudgeModeSchema.optional(),
    default_judge_model: z.string().min(1).optional(),
    default_judge_style: JudgeStyleSchema.optional(),
    factuality_enabled: z.boolean().optional(),
    factuality_model: z.string().min(1).optional(),
  })
  .strict()

const DEFAULT_JUDGE_CONFIG: JudgeConfig = {
  judge_mode: "metrics_only",
  default_judge_model: "gpt-4o",
  default_judge_style: "rubric",
  factuality_enabled: false,
  factuality_model: "gpt-4o-mini",
}

function mergeConfig(
  current: Partial<JudgeConfig> | null | undefined,
  updates: Partial<JudgeConfig>,
): JudgeConfig {
  return {
    judge_mode: updates.judge_mode ?? current?.judge_mode ?? DEFAULT_JUDGE_CONFIG.judge_mode,
    default_judge_model:
      updates.default_judge_model ??
      current?.default_judge_model ??
      DEFAULT_JUDGE_CONFIG.default_judge_model,
    default_judge_style:
      updates.default_judge_style ??
      current?.default_judge_style ??
      DEFAULT_JUDGE_CONFIG.default_judge_style,
    factuality_enabled:
      updates.factuality_enabled ??
      current?.factuality_enabled ??
      DEFAULT_JUDGE_CONFIG.factuality_enabled,
    factuality_model:
      updates.factuality_model ??
      current?.factuality_model ??
      DEFAULT_JUDGE_CONFIG.factuality_model,
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: getCorsHeaders() })
}

/**
 * GET /api/settings/judge
 * Returns the current LLM-judge configuration. Falls back to system defaults
 * if no row exists in app_settings yet.
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "judge_config")
      .single()

    const config = error || !data
      ? DEFAULT_JUDGE_CONFIG
      : mergeConfig(data.value as Partial<JudgeConfig>, {})

    return NextResponse.json(config, { headers: getCorsHeaders() })
  } catch (err) {
    console.error("[Settings] GET /judge error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch judge config" },
      { status: 500, headers: getCorsHeaders() },
    )
  }
}

/**
 * PATCH /api/settings/judge
 * Partially updates the LLM-judge configuration. Unspecified fields are left
 * untouched. Returns the merged config that is now persisted.
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const parseResult = UpdateJudgeSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parseResult.error.flatten().fieldErrors },
        { status: 400, headers: getCorsHeaders() },
      )
    }

    const supabase = getSupabaseAdmin()

    const { data: existing } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "judge_config")
      .single()

    const merged = mergeConfig(
      existing?.value as Partial<JudgeConfig> | undefined,
      parseResult.data,
    )

    const { error: writeError } = await supabase.from("app_settings").upsert(
      {
        key: "judge_config",
        value: merged,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    )

    if (writeError) {
      throw new Error(`Database error: ${writeError.message}`)
    }

    return NextResponse.json(
      { success: true, ...merged },
      { headers: getCorsHeaders() },
    )
  } catch (err) {
    console.error("[Settings] PATCH /judge error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update judge config" },
      { status: 500, headers: getCorsHeaders() },
    )
  }
}
