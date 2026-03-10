import { NextResponse } from "next/server"
import { getCorsHeaders } from "@/middleware/cors"
import { getActiveModelConfig, getAllModelConfigs } from "@/services/model-config.service"

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: getCorsHeaders() })
}

/**
 * GET /api/settings
 * Returns the active model config and all available model configs.
 */
export async function GET() {
  try {
    const [active, available] = await Promise.all([
      getActiveModelConfig(),
      getAllModelConfigs(),
    ])

    return NextResponse.json({ active, available }, { headers: getCorsHeaders() })
  } catch (error) {
    console.error("[Settings] GET error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch settings" },
      { status: 500, headers: getCorsHeaders() }
    )
  }
}
