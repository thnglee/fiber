import { NextResponse } from "next/server"
import { getCorsHeaders } from "@/middleware/cors"

type ErrorOptions = {
  context?: string
  defaultMessage?: string
  defaultStatus?: number
  includeStack?: boolean
  headers?: HeadersInit
}

/**
 * Build a consistent JSON error response with CORS headers and optional stack traces.
 */
export function buildErrorResponse(
  error: unknown,
  {
    context,
    defaultMessage = "Request failed",
    defaultStatus = 500,
    includeStack = process.env.NODE_ENV === "development",
    headers,
  }: ErrorOptions = {}
) {
  let message = defaultMessage
  let status = defaultStatus
  let details: string | undefined

  if (error instanceof Error) {
    message = error.message || defaultMessage

    const normalized = error.message.toLowerCase()
    if (normalized.includes("api key")) {
      message = "OpenAI API key is invalid or missing"
      status = 500
    } else if (normalized.includes("rate limit")) {
      message = "OpenAI API rate limit exceeded. Please try again later."
      status = 429
    } else if (normalized.includes("network") || normalized.includes("fetch")) {
      message = "Network error connecting to external service"
      status = 503
    }

    details = includeStack ? error.stack : undefined
  } else if (typeof error === "string") {
    message = error
  }

  if (context) {
    console.error(`[${context}]`, error)
  } else {
    console.error(error)
  }

  return NextResponse.json(
    {
      error: message,
      details: includeStack ? details : undefined,
    },
    {
      status,
      headers: {
        ...getCorsHeaders(),
        ...headers,
      },
    }
  )
}
