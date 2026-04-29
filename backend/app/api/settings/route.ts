import { NextResponse } from "next/server"
import { getCorsHeaders } from "@/middleware/cors"
import { getActiveModelConfig, getAllModelConfigs } from "@/services/model-config.service"
import { isAffordableModel } from "@/config/model-tiers"

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: getCorsHeaders() })
}

/**
 * GET /api/settings
 * Returns the active model config and the list of affordable models that can
 * be set as active. Expensive / aggregator-only models are filtered out — see
 * backend/config/model-tiers.ts.
 */
export async function GET() {
  try {
    const [active, all] = await Promise.all([
      getActiveModelConfig(),
      getAllModelConfigs(),
    ])

    const available = all.filter(m => isAffordableModel(m.model_name))

    return NextResponse.json({ active, available }, { headers: getCorsHeaders() })
  } catch (error) {
    console.error("[Settings] GET error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch settings" },
      { status: 500, headers: getCorsHeaders() }
    )
  }
}
