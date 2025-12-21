import { NextResponse } from "next/server"
import { ZodError } from "zod"
import { getCorsHeaders } from "@/middleware/cors"
import { formatZodErrorResponse } from "./zod-helpers"

/**
 * Standard API Error Response
 * Ensures consistent error format across all API endpoints
 */
export interface StandardApiError {
    error: string
    message?: string
    details?: any
    code?: string
}

/**
 * Create a standardized error response
 * 
 * @param error - Error message or Error object
 * @param status - HTTP status code (default: 500)
 * @param details - Optional additional details
 * @returns NextResponse with standardized error format
 */
export function createErrorResponse(
    error: string | Error,
    status: number = 500,
    details?: any
): NextResponse {
    const errorMessage = error instanceof Error ? error.message : error

    const errorBody: StandardApiError = {
        error: errorMessage,
        details: process.env.NODE_ENV === "development" ? details : undefined,
    }

    return NextResponse.json(errorBody, {
        status,
        headers: getCorsHeaders(),
    })
}

/**
 * Create a validation error response (400)
 */
export function createValidationError(
    message: string,
    details?: any
): NextResponse {
    return createErrorResponse(message, 400, details)
}

/**
 * Create a Zod validation error response
 */
export function createZodErrorResponse(error: ZodError): NextResponse {
    const errorData = formatZodErrorResponse(error)
    return NextResponse.json(errorData, {
        status: 400,
        headers: getCorsHeaders(),
    })
}

/**
 * Create a not found error response (404)
 */
export function createNotFoundError(resource: string): NextResponse {
    return createErrorResponse(`${resource} not found`, 404)
}

/**
 * Create an unauthorized error response (401)
 */
export function createUnauthorizedError(
    message: string = "Unauthorized"
): NextResponse {
    return createErrorResponse(message, 401)
}

/**
 * Create a server error response (500)
 */
export function createServerError(
    error: Error | string,
    context?: string
): NextResponse {
    const errorMessage = error instanceof Error ? error.message : error

    if (context) {
        console.error(`[${context}]`, error)
    } else {
        console.error(error)
    }

    return createErrorResponse(errorMessage, 500,
        error instanceof Error ? error.stack : undefined
    )
}

/**
 * Standardized API Response Builder
 * Provides consistent response format across all endpoints
 */
export const ApiResponse = {
    /**
     * Success response with data
     */
    success: <T>(data: T, status: number = 200): NextResponse => {
        return NextResponse.json(data, {
            status,
            headers: getCorsHeaders(),
        })
    },

    /**
     * Error response
     */
    error: (error: string | Error, status: number = 500, details?: any): NextResponse => {
        return createErrorResponse(error, status, details)
    },

    /**
     * Validation error (400)
     */
    validationError: (message: string, details?: any): NextResponse => {
        return createValidationError(message, details)
    },

    /**
     * Zod validation error (400)
     */
    zodError: (error: ZodError): NextResponse => {
        return createZodErrorResponse(error)
    },

    /**
     * Not found error (404)
     */
    notFound: (resource: string): NextResponse => {
        return createNotFoundError(resource)
    },

    /**
     * Unauthorized error (401)
     */
    unauthorized: (message?: string): NextResponse => {
        return createUnauthorizedError(message)
    },

    /**
     * Server error (500)
     */
    serverError: (error: Error | string, context?: string): NextResponse => {
        return createServerError(error, context)
    },
}
