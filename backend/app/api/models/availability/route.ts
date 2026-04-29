import { NextResponse } from "next/server"
import { getCorsHeaders } from "@/middleware/cors"
import { getModelAvailability } from "@/output-fusion/moa.config"

export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: getCorsHeaders() })
}

/**
 * GET /api/models/availability
 *
 * Returns `ModelAvailability[]` for the MoA model selector UI. The frontend
 * uses `can_be_proposer` / `can_be_aggregator` to enable/disable checkboxes
 * and shows `unavailable_reason` as tooltip text for disabled models.
 */
export async function GET() {
  try {
    const availability = await getModelAvailability()
    return NextResponse.json(availability, { headers: getCorsHeaders() })
  } catch (error) {
    console.error("[Models Availability] GET error:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch model availability",
      },
      { status: 500, headers: getCorsHeaders() },
    )
  }
}
