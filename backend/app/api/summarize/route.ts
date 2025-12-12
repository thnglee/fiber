import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"
import { getCorsHeaders } from "@/middleware/cors"
import { buildErrorResponse } from "@/utils/apiError"
import { performSummarize } from "@/services/summarize.service"
import { SummarizeRequestSchema, SummarizeResponseSchema } from "@/domain/schemas"
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
 * POST /api/summarize
 * Summarize endpoint handler
 * 
 * Validates input and delegates business logic to summarizeService
 */
export async function POST(request: NextRequest) {
  try {
    // Check API key first before processing request
    try {
      getEnvVar("OPENAI_API_KEY")
    } catch (error) {
      console.error("OPENAI_API_KEY is not set in environment variables")
      return NextResponse.json(
        { 
          error: "OpenAI API key not configured",
          hint: "Please set OPENAI_API_KEY in your .env file"
        },
        { status: 500, headers: getCorsHeaders() }
      )
    }

    // Parse and validate request body
    const body = await request.json()
    const parseResult = SummarizeRequestSchema.safeParse(body)

    if (!parseResult.success) {
      return zodErrorResponse(parseResult.error, 400)
    }

    const { content, url, debug } = parseResult.data

    // Delegate to service layer
    // Service will handle validation and extraction
    const response = await performSummarize({ content, url, debug })

    // Validate response before sending
    const responseParseResult = SummarizeResponseSchema.safeParse(response)
    if (!responseParseResult.success) {
      return zodErrorResponse(responseParseResult.error, 500)
    }

    return NextResponse.json(responseParseResult.data, { headers: getCorsHeaders() })
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof ZodError) {
      return zodErrorResponse(error, 500)
    }

    // Handle specific validation errors from service
    if (error instanceof Error && error.message.includes("required")) {
      return NextResponse.json(
        { error: error.message },
        { status: 400, headers: getCorsHeaders() }
      )
    }

    if (error instanceof Error && error.message.includes("empty")) {
      return NextResponse.json(
        { error: error.message },
        { status: 400, headers: getCorsHeaders() }
      )
    }

    // Handle URL extraction errors
    if (error instanceof Error && (error.message.includes("fetch") || error.message.includes("extract"))) {
      return NextResponse.json(
        { 
          error: error.message,
          details: process.env.NODE_ENV === "development" ? error.stack : undefined
        },
        { status: 400, headers: getCorsHeaders() }
      )
    }

    return buildErrorResponse(error, {
      context: "summarize",
      defaultMessage: "Failed to summarize",
    })
  }
}

