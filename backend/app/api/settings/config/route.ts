import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getCorsHeaders } from "@/middleware/cors"
import { updateModelConfig } from "@/services/model-config.service"

const UpdateConfigSchema = z.object({
  model: z.string().min(1, "Model name is required"),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).nullable().optional(),
  top_k: z.number().int().positive().nullable().optional(),
  max_tokens: z.number().int().positive().nullable().optional(),
  min_tokens: z.number().int().positive().nullable().optional(),
  frequency_penalty: z.number().min(-2).max(2).nullable().optional(),
  presence_penalty: z.number().min(-2).max(2).nullable().optional(),
  seed: z.number().int().nullable().optional(),
})

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: getCorsHeaders() })
}

/**
 * PATCH /api/settings/config
 * Update tunable parameters for a model configuration.
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const parseResult = UpdateConfigSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parseResult.error.flatten().fieldErrors },
        { status: 400, headers: getCorsHeaders() }
      )
    }

    const { model, ...params } = parseResult.data
    const config = await updateModelConfig(model, params)

    return NextResponse.json({ success: true, config }, { headers: getCorsHeaders() })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update model config"
    const status = message.includes("not found") ? 404
      : message.includes("No writable") ? 400
      : 500

    console.error("[Settings] PATCH /config error:", error)
    return NextResponse.json(
      { error: message },
      { status, headers: getCorsHeaders() }
    )
  }
}
