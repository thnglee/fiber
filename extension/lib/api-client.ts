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
 * @returns Promise resolving to summary response
 */
export async function summarizeArticle(
  content: string,
  context?: PageContext
): Promise<SummaryResponse> {
  // Get context if not provided
  const pageContext = context || getPageContext()

  return fetchAPI<SummaryResponse>("/summarize", {
    method: "POST",
    body: JSON.stringify({
      content,
      website: pageContext.hostname,
    }),
  })
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
