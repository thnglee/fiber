import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getCorsHeaders } from "@/middleware/cors"
import { setActiveModel, getActiveModelConfig } from "@/services/model-config.service"

const SetActiveSchema = z.object({
  model: z.string().min(1, "Model name is required"),
})

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: getCorsHeaders() })
}

/**
 * PATCH /api/settings/active
 * Switch the active model.
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const parseResult = SetActiveSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parseResult.error.flatten().fieldErrors },
        { status: 400, headers: getCorsHeaders() }
      )
    }

    await setActiveModel(parseResult.data.model)
    const active = await getActiveModelConfig()

    return NextResponse.json({ success: true, active }, { headers: getCorsHeaders() })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to set active model"
    const status = message.includes("not found") ? 404 : 500

    console.error("[Settings] PATCH /active error:", error)
    return NextResponse.json(
      { error: message },
      { status, headers: getCorsHeaders() }
    )
  }
}
