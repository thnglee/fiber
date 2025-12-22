import type { FactCheckResponse, SummaryResponse, ApiError, PageContext } from "./types"
import { getPageContext } from "./context-provider"
import { API } from "./constants"

const API_BASE_URL = process.env.PLASMO_PUBLIC_API_URL || "http://localhost:3000/api"

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Calculate exponential backoff delay
 */
function getRetryDelay(attempt: number): number {
  return API.RETRY_BASE_DELAY * Math.pow(2, attempt)
}

/**
 * Generic fetch wrapper with error handling and retry logic
 * 
 * @param endpoint - API endpoint path
 * @param options - Fetch options
 * @param retryCount - Current retry attempt (internal use)
 * @returns Promise resolving to typed response
 */
async function fetchAPI<T>(
  endpoint: string,
  options?: RequestInit,
  retryCount: number = 0
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`

  try {
    console.log(`[API] ${options?.method || 'GET'} ${endpoint}`, {
      attempt: retryCount + 1,
      maxRetries: API.MAX_RETRIES + 1,
    })

    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      signal: AbortSignal.timeout(API.TIMEOUT),
    })

    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        message: `HTTP ${response.status}: ${response.statusText}`,
      }))

      // Log detailed error information
      console.error(`[API] Request failed:`, {
        endpoint,
        status: response.status,
        statusText: response.statusText,
        error: error.message,
        body: options?.body,
      })

      // Retry on 5xx errors or network issues
      if (response.status >= 500 && retryCount < API.MAX_RETRIES) {
        const delay = getRetryDelay(retryCount)
        console.log(`[API] Retrying in ${delay}ms...`)
        await sleep(delay)
        return fetchAPI<T>(endpoint, options, retryCount + 1)
      }

      throw new Error(error.message || "API request failed")
    }

    const data = await response.json()
    console.log(`[API] Success:`, { endpoint, dataKeys: Object.keys(data) })
    return data
  } catch (error) {
    // Handle network errors and timeouts
    if (error instanceof Error) {
      // Retry on network errors
      if (
        (error.name === "TypeError" || error.name === "AbortError") &&
        retryCount < API.MAX_RETRIES
      ) {
        const delay = getRetryDelay(retryCount)
        console.log(`[API] Network error, retrying in ${delay}ms...`, error.message)
        await sleep(delay)
        return fetchAPI<T>(endpoint, options, retryCount + 1)
      }

      // Enhance error message with context
      const enhancedError = new Error(
        `API request failed: ${error.message} (endpoint: ${endpoint}, attempt: ${retryCount + 1}/${API.MAX_RETRIES + 1})`
      )
      console.error(`[API] Fatal error:`, enhancedError)
      throw enhancedError
    }

    throw new Error("Unknown error occurred")
  }
}

/**
 * Summarize article content
 * 
 * @param content - Article content to summarize
 * @param context - Optional page context (will be auto-detected if not provided)
 * @param url - Optional URL of the page being summarized (for tracking purposes)
 * @returns Promise resolving to summary response
 */
export async function summarizeArticle(
  content: string,
  context?: PageContext,
  url?: string
): Promise<SummaryResponse> {
  // Get context if not provided
  const pageContext = context || getPageContext()

  return fetchAPI<SummaryResponse>("/summarize", {
    method: "POST",
    body: JSON.stringify({
      content,
      url, // Include URL for proper input type tracking
      website: pageContext.hostname,
    }),
  })
}

/**
 * Stream article summarization with progressive text rendering
 * Uses Server-Sent Events (SSE) for real-time updates
 * 
 * @param content - Article content to summarize
 * @param context - Optional page context (will be auto-detected if not provided)
 * @param url - Optional URL of the page being summarized (for tracking purposes)
 * @yields Progressive updates with summary deltas and metadata
 */
export async function* summarizeArticleStream(
  content: string,
  context?: PageContext,
  url?: string
): AsyncGenerator<{
  type: 'summary-delta' | 'metadata' | 'error' | 'done'
  delta?: string
  category?: string
  readingTime?: number
  error?: string
}> {
  // Get context if not provided
  const pageContext = context || getPageContext()

  const apiUrl = `${API_BASE_URL}/summarize?stream=true`

  console.log('[API] Starting streaming summarization', { url: apiUrl })

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content,
        url,
        website: pageContext.hostname,
      }),
      signal: AbortSignal.timeout(API.TIMEOUT),
    })

    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        message: `HTTP ${response.status}: ${response.statusText}`,
      }))
      throw new Error(error.message || "Streaming request failed")
    }

    // Check if response is actually SSE
    const contentType = response.headers.get('content-type')
    if (!contentType?.includes('text/event-stream')) {
      throw new Error('Expected SSE response but got: ' + contentType)
    }

    // Read the SSE stream
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('Response body is not readable')
    }

    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          console.log('[API] Stream completed')
          break
        }

        // Decode chunk and add to buffer
        buffer += decoder.decode(value, { stream: true })

        // Process complete SSE messages (ending with \n\n)
        const messages = buffer.split('\n\n')
        buffer = messages.pop() || '' // Keep incomplete message in buffer

        for (const message of messages) {
          if (!message.trim()) continue

          // Parse SSE data line (format: "data: {JSON}")
          const dataMatch = message.match(/^data: (.+)$/m)
          if (dataMatch) {
            try {
              const chunk = JSON.parse(dataMatch[1])

              console.log('[API] Received chunk:', chunk.type)

              // Yield the parsed chunk
              yield chunk

              // Stop if we receive done or error
              if (chunk.type === 'done' || chunk.type === 'error') {
                return
              }
            } catch (parseError) {
              console.error('[API] Failed to parse SSE data:', parseError)
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  } catch (error) {
    console.error('[API] Streaming error:', error)

    yield {
      type: 'error',
      error: error instanceof Error ? error.message : 'Streaming failed'
    }
  }
}

/**
 * Fact-check selected text
 * 
 * @param text - Text to fact-check
 * @param context - Optional page context (will be auto-detected if not provided)
 * @returns Promise resolving to fact-check response
 */
export async function factCheck(
  text: string,
  context?: PageContext
): Promise<FactCheckResponse> {
  // Get context if not provided
  const pageContext = context || getPageContext()

  return fetchAPI<FactCheckResponse>("/fact-check", {
    method: "POST",
    body: JSON.stringify({
      text,
      website: pageContext.hostname,
    }),
  })
}
