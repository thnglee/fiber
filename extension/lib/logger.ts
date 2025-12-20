/**
 * Structured Logger
 * 
 * Provides consistent logging with levels, namespaces, and context.
 * In production mode, only errors are logged to reduce noise.
 */

type LogLevel = "debug" | "info" | "warn" | "error"

interface LogContext {
    [key: string]: any
}

/**
 * Logger class with namespace support
 */
export class Logger {
    private namespace: string
    private minLevel: LogLevel

    constructor(namespace: string) {
        this.namespace = namespace
        // In production, only log errors
        this.minLevel = process.env.NODE_ENV === "production" ? "error" : "debug"
    }

    /**
     * Get numeric level for comparison
     */
    private getLevelValue(level: LogLevel): number {
        const levels: Record<LogLevel, number> = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3,
        }
        return levels[level]
    }

    /**
     * Check if level should be logged
     */
    private shouldLog(level: LogLevel): boolean {
        return this.getLevelValue(level) >= this.getLevelValue(this.minLevel)
    }

    /**
     * Format log message with timestamp and namespace
     */
    private format(level: LogLevel, message: string, context?: LogContext): string {
        const timestamp = new Date().toISOString()
        const contextStr = context ? ` ${JSON.stringify(context)}` : ""
        return `[${timestamp}] [${level.toUpperCase()}] [${this.namespace}] ${message}${contextStr}`
    }

    /**
     * Debug level logging
     */
    debug(message: string, context?: LogContext): void {
        if (this.shouldLog("debug")) {
            console.log(this.format("debug", message, context))
        }
    }

    /**
     * Info level logging
     */
    info(message: string, context?: LogContext): void {
        if (this.shouldLog("info")) {
            console.log(this.format("info", message, context))
        }
    }

    /**
     * Warning level logging
     */
    warn(message: string, context?: LogContext): void {
        if (this.shouldLog("warn")) {
            console.warn(this.format("warn", message, context))
        }
    }

    /**
     * Error level logging
     */
    error(message: string, error?: Error | unknown, context?: LogContext): void {
        if (this.shouldLog("error")) {
            const errorContext = error instanceof Error
                ? { ...context, error: error.message, stack: error.stack }
                : context
            console.error(this.format("error", message, errorContext))
        }
    }
}

/**
 * Create a logger instance for a namespace
 */
export function createLogger(namespace: string): Logger {
    return new Logger(namespace)
}

// Export pre-configured loggers for common modules
export const apiLogger = createLogger("API")
export const modalLogger = createLogger("Modal")
export const sidebarLogger = createLogger("Sidebar")
export const pageDetectorLogger = createLogger("PageDetector")
export const navigationLogger = createLogger("Navigation")
