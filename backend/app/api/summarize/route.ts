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
  const startTime = Date.now()

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

    const { content, url, debug, website } = parseResult.data

    // Check if streaming is requested
    const { searchParams } = new URL(request.url)
    const isStreaming = searchParams.get('stream') === 'true'

    if (isStreaming) {
      // ============================================================================
      // STREAMING MODE - Server-Sent Events
      // ============================================================================
      const { performSummarizeStream } = await import('@/services/summarize.service')

      // Track accumulated data for action logging
      let accumulatedSummary = ''
      let finalCategory = ''
      let finalReadingTime = 0
      let finalUsage: any = undefined

      // Create a readable stream for SSE
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        async start(controller) {
          try {
            // Stream summary chunks
            for await (const chunk of performSummarizeStream({ content, url, debug })) {
              // Accumulate data for tracking
              if (chunk.type === 'summary-delta' && chunk.delta) {
                accumulatedSummary += chunk.delta
              } else if (chunk.type === 'metadata') {
                finalCategory = chunk.category || ''
                finalReadingTime = chunk.readingTime || 0
                finalUsage = chunk.usage
              }

              // Send SSE formatted data
              const data = `data: ${JSON.stringify(chunk)}\n\n`
              controller.enqueue(encoder.encode(data))
            }

            // ✅ CRITICAL FIX: Track action BEFORE closing stream
            // This ensures database insert completes before request handler terminates
            console.log('[Summarize Stream] Streaming complete, tracking action...')
            const processingTime = Date.now() - startTime
            const { trackAction, getClientIP, extractTokenUsage } = await import('@/services/action-tracking.service')

            // Parse accumulated JSON to extract summary text
            let summaryText = ''
            try {
              const parsed = JSON.parse(accumulatedSummary)
              summaryText = parsed.summary || ''
            } catch (e) {
              // If parsing fails, try regex extraction
              const summaryMatch = accumulatedSummary.match(/"summary"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/)
              if (summaryMatch) {
                summaryText = summaryMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"')
              }
            }

            console.log('[Summarize Stream] finalUsage before extraction:', finalUsage)
            // ✅ Always extract token usage - returns default {0,0,0} if undefined
            // This prevents NOT NULL constraint violations in the database
            const tokenUsage = extractTokenUsage({ usage: finalUsage })

            console.log('[Summarize Stream] Tracking action with data:', {
              summaryLength: summaryText.length,
              category: finalCategory,
              readingTime: finalReadingTime,
              hasTokenUsage: !!tokenUsage,
              inputType: url ? 'url' : 'text'
            })

            try {
              await trackAction({
                actionType: 'summarize',
                inputType: url ? 'url' : 'text',
                inputContent: url || content || '',
                outputContent: {
                  summary: summaryText,
                  category: finalCategory,
                  readingTime: finalReadingTime
                },
                category: finalCategory,
                tokenUsage,
                userIp: getClientIP(request.headers),
                website: website || 'unknown',
                userAgent: request.headers.get('user-agent') || 'unknown',
                processingTimeMs: processingTime
              })
              console.log('[Summarize Stream] ✅ Action tracked successfully!')
            } catch (err) {
              console.error('[Summarize Stream] ❌ Failed to track action:', err)
            }

            // ✅ Close stream AFTER tracking completes
            controller.close()
          } catch (error) {
            // Send error event
            const errorData = `data: ${JSON.stringify({
              type: 'error',
              error: error instanceof Error ? error.message : 'Streaming failed'
            })}\n\n`
            controller.enqueue(encoder.encode(errorData))
            controller.close()
          }
        }
      })

      // Return SSE response
      return new NextResponse(stream, {
        headers: {
          ...getCorsHeaders(),
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        }
      })
    } else {
      // ============================================================================
      // NON-STREAMING MODE - Regular JSON response (backward compatible)
      // ============================================================================

      // Delegate to service layer
      // Service will handle validation and extraction
      const response = await performSummarize({ content, url, debug })

      // Validate response before sending
      const responseParseResult = SummarizeResponseSchema.safeParse(response)
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
        actionType: 'summarize',
        inputType: url ? 'url' : 'text',
        inputContent: url || content || '',
        outputContent: responseParseResult.data,
        category: responseParseResult.data.category,
        tokenUsage,
        userIp: getClientIP(request.headers),
        website: website || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        processingTimeMs: processingTime
      }).catch(err => {
        console.error('[Summarize] Failed to track action:', err)
      })

      return NextResponse.json(responseParseResult.data, { headers: getCorsHeaders() })
    }
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

