/* 
 * Lightweight live log viewer (admin-only context, no auth enforced here).
 * Streams logs from /api/logs/stream (SSE) and renders them in real time.
 */
"use client"

import { useEffect, useMemo, useState } from "react"

type LogEntry = {
  id: string
  timestamp: number
  type: string
  stage: string
  data: unknown
}

export default function LiveLogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [connected, setConnected] = useState(false)

  // Keep most recent entries at the top, cap to 500 on the client
  const sortedLogs = useMemo(
    () => [...logs].sort((a, b) => b.timestamp - a.timestamp).slice(0, 500),
    [logs]
  )

  useEffect(() => {
    const source = new EventSource("/api/logs/stream")

    source.onopen = () => setConnected(true)
    source.onerror = () => setConnected(false)

    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        // Ignore handshake/heartbeat messages that lack log fields
        if (!payload || !payload.id || !payload.timestamp) return
        setLogs((prev) => {
          const next = [...prev, payload as LogEntry]
          return next.length > 500 ? next.slice(next.length - 500) : next
        })
      } catch {
        // Swallow malformed messages; SSE should keep flowing
      }
    }

    return () => {
      source.close()
    }
  }, [])

  return (
    <main className="mx-auto max-w-5xl p-6 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Live Logs</h1>
          <p className="text-sm text-gray-500">
            Streaming from <code className="font-mono text-xs">/api/logs/stream</code>. No auth applied (admin context).
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm ${
            connected ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-gray-400"}`} />
          {connected ? "Connected" : "Disconnected"}
        </span>
      </header>

      <section className="space-y-3">
        {sortedLogs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-gray-500">
            Waiting for log events...
          </div>
        ) : (
          <ul className="space-y-2">
            {sortedLogs.map((log) => (
              <li
                key={log.id}
                className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700">
                      {log.type}
                    </span>
                    <span className="rounded bg-gray-50 px-2 py-0.5 font-mono text-xs text-gray-500">
                      {log.stage}
                    </span>
                  </div>
                  <time className="text-xs text-gray-500">
                    {new Date(log.timestamp).toLocaleString()}
                  </time>
                </div>
                <pre className="mt-2 overflow-auto rounded bg-gray-50 p-3 text-xs text-gray-800">
                  {JSON.stringify(log.data, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
