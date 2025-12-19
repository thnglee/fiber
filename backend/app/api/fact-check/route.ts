import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"
import { getCorsHeaders } from "@/middleware/cors"
import { buildErrorResponse } from "@/utils/apiError"
import { performFactCheck } from "@/services/fact-check.service"
import { FactCheckRequestSchema, FactCheckResponseSchema } from "@/domain/schemas"
import { zodErrorResponse } from "@/utils/zod-helpers"
import { getEnvVar } from "@/config/env"

// Handle CORS preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: getCorsHeaders(),
  })
}

/**
 * POST /api/fact-check
 * Fact-check endpoint handler
 * 
 * Validates input and delegates business logic to factCheckService
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Parse and validate request body
    const body = await request.json()
    const parseResult = FactCheckRequestSchema.safeParse(body)

    if (!parseResult.success) {
      return zodErrorResponse(parseResult.error, 400)
    }

    const { text, debug, website } = parseResult.data

    // Validate API keys are configured (using env schema)
    try {
      getEnvVar("OPENAI_API_KEY")
      getEnvVar("TAVILY_API_KEY")
    } catch (error) {
      return NextResponse.json(
        { error: "API keys not configured" },
        { status: 500, headers: getCorsHeaders() }
      )
    }

    // Delegate to service layer
    const response = await performFactCheck({ text, debug })

    // Validate response before sending
    const responseParseResult = FactCheckResponseSchema.safeParse(response)
    if (!responseParseResult.success) {
      return zodErrorResponse(responseParseResult.error, 500)
    }

    // Track action asynchronously (fire-and-forget)
    const processingTime = Date.now() - startTime
    const { trackAction, getClientIP, extractTokenUsage } = await import('@/services/action-tracking.service')

    // Extract token usage - try direct access first, then fall back to debug structure
    const tokenUsage = response.usage
      ? extractTokenUsage({ usage: response.usage })
      : extractTokenUsage(response.debug?.openaiResponse)

    trackAction({
      actionType: 'fact-check',
      inputType: 'text',
      inputContent: text,
      outputContent: responseParseResult.data,
      category: null,
      tokenUsage,
      userIp: getClientIP(request.headers),
      website: website || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      processingTimeMs: processingTime
    }).catch(err => {
      console.error('[Fact-check] Failed to track action:', err)
    })

    return NextResponse.json(responseParseResult.data, { headers: getCorsHeaders() })
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof ZodError) {
      return zodErrorResponse(error, 500)
    }

    return buildErrorResponse(error, {
      context: "fact-check",
      defaultMessage: "Failed to fact-check",
    })
  }
}

