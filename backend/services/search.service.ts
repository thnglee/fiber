import { TavilyClient } from "tavily"
import { logger } from "@/lib/logger"
import { getSupportedDomains } from "@/config/app.config"
import { getEnvVar } from "@/config/env"
import type {
  SearchOptions,
  SearchResult,
  SearchResponse,
} from "@/domain/types"

const tavilyClient = new TavilyClient({ apiKey: getEnvVar("TAVILY_API_KEY") })

// Re-export types for backward compatibility
export type { SearchOptions, SearchResult, SearchResponse }

/**
 * Search for relevant sources using Tavily API
 * 
 * @param options - Search options
 * @returns Search results with sources and formatted content
 */
export async function searchSources(options: SearchOptions): Promise<SearchResponse> {
  const {
    query,
    maxResults = 6,
    searchDepth = "basic",
    domains,
    debug = false
  } = options

  const supportedDomains = domains || getSupportedDomains()

  logger.addLog('search', 'input', {
    query,
    maxResults,
    domains: supportedDomains
  })

  const searchResponse = await tavilyClient.search({
    query,
    search_depth: searchDepth,
    max_results: maxResults,
    include_domains: supportedDomains
  })

  const results: SearchResult[] = searchResponse.results.map((result: any) => ({
    title: result.title || "Untitled",
    url: result.url,
    content: result.content || "",
    score: result.score || 0
  }))

  logger.addLog('search', 'output', {
    resultsCount: results.length,
    results: results.map(result => ({
      title: result.title,
      url: result.url,
      contentLength: result.content.length,
      score: result.score
    }))
  })

  const sources = results.map(result => result.url)
  const sourceContent = results
    .map(result => `[${result.title}](${result.url}): ${result.content}`)
    .join("\n\n")

  const debugInfo = debug ? {
    query,
    resultsCount: results.length,
    results: results.map(result => ({
      title: result.title,
      url: result.url,
      content: result.content.substring(0, 500) + (result.content.length > 500 ? "..." : ""),
      contentLength: result.content.length,
      score: result.score
    }))
  } : undefined

  return {
    sources,
    sourceContent,
    results,
    debugInfo
  }
}
