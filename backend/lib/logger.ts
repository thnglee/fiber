// In-memory log storage for live logging
import { LogEntrySchema, type LogEntry } from "@/domain/schemas"

class Logger {
  private logs: LogEntry[] = []
  private maxLogs = 1000
  private subscribers: Set<(log: LogEntry) => void> = new Set()

  addLog(type: string, stage: string, data: any) {
    const logData = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      timestamp: Date.now(),
      type,
      stage,
      data
    }

    // Validate log entry against schema
    const log = LogEntrySchema.parse(logData)

    this.logs.push(log)
    
    // Keep only the last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs.shift()
    }

    // Notify all subscribers
    this.subscribers.forEach(subscriber => {
      try {
        subscriber(log)
      } catch (error) {
        console.error('Error notifying log subscriber:', error)
      }
    })

    return log
  }

  getLogs(limit: number = 100): LogEntry[] {
    return this.logs.slice(-limit)
  }

  subscribe(callback: (log: LogEntry) => void) {
    this.subscribers.add(callback)
    return () => {
      this.subscribers.delete(callback)
    }
  }

  clear() {
    this.logs = []
  }
}

export const logger = new Logger()

