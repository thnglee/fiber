import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getCorsHeaders } from "@/middleware/cors"
import { getSupabaseAdmin } from "@/lib/supabase"

const FusionConfigPersistSchema = z.object({
  proposerModels: z.array(z.string()).min(2).max(5).optional(),
  aggregatorModel: z.string().optional(),
})

const UpdateRoutingSchema = z.object({
  routing_mode: z.enum(["auto", "evaluation", "forced", "fusion"]).optional(),
  complexity_thresholds: z
    .object({
      short: z.number().int().positive(),
      medium: z.number().int().positive(),
    })
    .optional(),
  fusion_config: FusionConfigPersistSchema.nullable().optional(),
})

const DEFAULT_ROUTING_CONFIG = {
  routing_mode: "forced",
  complexity_thresholds: { short: 400, medium: 1500 },
  fusion_config: null as null | { proposerModels?: string[]; aggregatorModel?: string },
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: getCorsHeaders() })
}

/**
 * GET /api/settings/routing
 * Returns routing configuration and HF availability.
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()

    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "routing_config")
      .single()

    const config = error || !data ? DEFAULT_ROUTING_CONFIG : data.value

    return NextResponse.json(
      {
        routing_mode: config.routing_mode ?? DEFAULT_ROUTING_CONFIG.routing_mode,
        complexity_thresholds:
          config.complexity_thresholds ?? DEFAULT_ROUTING_CONFIG.complexity_thresholds,
        fusion_config: config.fusion_config ?? DEFAULT_ROUTING_CONFIG.fusion_config,
        hf_available: !!process.env.HF_API_KEY,
      },
      { headers: getCorsHeaders() }
    )
  } catch (err) {
    console.error("[Settings] GET /routing error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch routing config" },
      { status: 500, headers: getCorsHeaders() }
    )
  }
}

/**
 * POST /api/settings/routing
 * Update routing configuration.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parseResult = UpdateRoutingSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parseResult.error.flatten().fieldErrors },
        { status: 400, headers: getCorsHeaders() }
      )
    }

    const supabase = getSupabaseAdmin()

    // Fetch current config
    const { data: existing } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "routing_config")
      .single()

    const currentConfig = existing?.value ?? DEFAULT_ROUTING_CONFIG

    // Merge updates. fusion_config: `null` clears the stored selection, `undefined` leaves it untouched.
    const fusionConfigNext =
      parseResult.data.fusion_config === undefined
        ? currentConfig.fusion_config ?? null
        : parseResult.data.fusion_config

    const updatedConfig = {
      ...currentConfig,
      ...parseResult.data,
      complexity_thresholds: parseResult.data.complexity_thresholds
        ? parseResult.data.complexity_thresholds
        : currentConfig.complexity_thresholds,
      fusion_config: fusionConfigNext,
    }

    const { error } = await supabase.from("app_settings").upsert(
      {
        key: "routing_config",
        value: updatedConfig,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    )

    if (error) {
      throw new Error(`Database error: ${error.message}`)
    }

    return NextResponse.json(
      {
        success: true,
        routing_mode: updatedConfig.routing_mode,
        complexity_thresholds: updatedConfig.complexity_thresholds,
        fusion_config: updatedConfig.fusion_config ?? null,
        hf_available: !!process.env.HF_API_KEY,
      },
      { headers: getCorsHeaders() }
    )
  } catch (err) {
    console.error("[Settings] POST /routing error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update routing config" },
      { status: 500, headers: getCorsHeaders() }
    )
  }
}
