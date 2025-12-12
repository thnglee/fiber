import { z } from "zod"
import { NextResponse } from "next/server"
import { getCorsHeaders } from "@/middleware/cors"

/**
 * Zod Helpers
 * Standardized error formatting for Zod validation errors
 */

/**
 * Format Zod error into a user-friendly message
 */
export function formatZodError(error: z.ZodError): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "root"
    return `${path}: ${issue.message}`
  })
  return issues.join("; ")
}

/**
 * Format Zod error into a structured error response
 */
export function formatZodErrorResponse(error: z.ZodError) {
  const issues = error.issues.map((issue) => ({
    path: issue.path,
    message: issue.message,
    code: issue.code,
  }))

  return {
    error: "Validation failed",
    details: issues,
    message: formatZodError(error),
  }
}

/**
 * Create a NextResponse for Zod validation errors
 */
export function zodErrorResponse(error: z.ZodError, status: number = 400) {
  return NextResponse.json(formatZodErrorResponse(error), {
    status,
    headers: getCorsHeaders(),
  })
}

/**
 * Safe parse helper that throws formatted error
 */
export function safeParseOrThrow<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context?: string
): T {
  const result = schema.safeParse(data)
  
  if (!result.success) {
    const errorMessage = formatZodError(result.error)
    throw new Error(context ? `${context}: ${errorMessage}` : errorMessage)
  }
  
  return result.data
}
