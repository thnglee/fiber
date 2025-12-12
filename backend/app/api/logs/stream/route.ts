import { NextRequest } from "next/server"
import { logger } from "@/lib/logger"
import { getCorsHeaders } from "@/middleware/cors"

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: getCorsHeaders(),
  })
}

// Server-Sent Events endpoint for streaming logs
export async function GET(request: NextRequest) {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()

      // Send initial connection message
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "connected" })}\n\n`)
      )

      // Subscribe to new logs
      const unsubscribe = logger.subscribe((log) => {
        try {
          const data = `data: ${JSON.stringify(log)}\n\n`
          controller.enqueue(encoder.encode(data))
        } catch (error) {
          console.error("Error sending log:", error)
        }
      })

      // Send existing logs
      const existingLogs = logger.getLogs(100)
      existingLogs.forEach((log) => {
        const data = `data: ${JSON.stringify(log)}\n\n`
        controller.enqueue(encoder.encode(data))
      })

      // Handle client disconnect
      request.signal.addEventListener("abort", () => {
        unsubscribe()
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      ...getCorsHeaders(),
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  })
}

