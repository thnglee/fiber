import { NextRequest } from "next/server"
import { logger } from "@/lib/logger"
import { getCorsHeaders } from "@/middleware/cors"
import { LogsResponseSchema, ClearLogsRequestSchema } from "@/domain/schemas"
import { zodErrorResponse, formatZodErrorResponse } from "@/utils/zod-helpers"

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: getCorsHeaders(),
  })
}

// GET endpoint to retrieve logs
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const limit = parseInt(searchParams.get("limit") || "100")

  const logs = logger.getLogs(limit)

  // Validate response before sending
  const responseParseResult = LogsResponseSchema.safeParse({ logs })
  if (!responseParseResult.success) {
    const errorData = formatZodErrorResponse(responseParseResult.error)
    return Response.json(
      errorData,
      { status: 500, headers: getCorsHeaders() }
    )
  }

  return Response.json(
    responseParseResult.data,
    { headers: getCorsHeaders() }
  )
}

// POST endpoint to clear logs
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parseResult = ClearLogsRequestSchema.safeParse(body)

    if (!parseResult.success) {
      return zodErrorResponse(parseResult.error, 400)
    }

    const { action } = parseResult.data

    if (action === "clear") {
      logger.clear()
      return Response.json(
        { success: true },
        { headers: getCorsHeaders() }
      )
    }

    return Response.json(
      { error: "Invalid action" },
      { status: 400, headers: getCorsHeaders() }
    )
  } catch {
    return Response.json(
      { error: "Invalid request" },
      { status: 400, headers: getCorsHeaders() }
    )
  }
}

