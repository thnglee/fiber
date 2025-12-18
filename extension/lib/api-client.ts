import type { FactCheckResponse, SummaryResponse, ApiError } from "./types"

const API_BASE_URL = process.env.PLASMO_PUBLIC_API_URL || "http://localhost:3000/api"

/**
 * Generic fetch wrapper with error handling
 */
async function fetchAPI<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    })

    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        message: `HTTP ${response.status}: ${response.statusText}`,
      }))
      throw new Error(error.message || "API request failed")
    }

    return await response.json()
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error("Unknown error occurred")
  }
}

/**
 * Summarize article content
 */
export async function summarizeArticle(content: string): Promise<SummaryResponse> {
  return fetchAPI<SummaryResponse>("/summarize", {
    method: "POST",
    body: JSON.stringify({
      content,
      website: window.location.hostname
    }),
  })
}

/**
 * Fact-check selected text
 */
export async function factCheck(text: string): Promise<FactCheckResponse> {
  return fetchAPI<FactCheckResponse>("/fact-check", {
    method: "POST",
    body: JSON.stringify({
      text,
      website: window.location.hostname
    }),
  })
}
