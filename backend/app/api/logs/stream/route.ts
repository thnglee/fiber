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

      // Send existing logs FIRST to avoid race condition
      const existingLogs = logger.getLogs(100)
      existingLogs.forEach((log) => {
        const data = `data: ${JSON.stringify(log)}\n\n`
        controller.enqueue(encoder.encode(data))
      })

      // THEN subscribe to new logs (prevents duplicates)
      const unsubscribe = logger.subscribe((log) => {
        try {
          const data = `data: ${JSON.stringify(log)}\n\n`
          controller.enqueue(encoder.encode(data))
        } catch (error) {
          console.error("Error sending log:", error)
        }
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

