import { Readability } from "@mozilla/readability"
import { JSDOM } from "jsdom"
import { logger } from "@/lib/logger"
import type { ExtractedContent } from "@/domain/types"

// Re-export type for backward compatibility
export type { ExtractedContent }

/**
 * Extract readable content from a URL using Readability
 * 
 * @param url - URL to extract content from
 * @returns Extracted content with title and excerpt if available
 * @throws Error if URL fetch or content extraction fails
 */
export async function extractContentFromUrl(url: string): Promise<ExtractedContent> {
  // Fetch the HTML from the URL
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`)
  }

  const html = await response.text()

  // Parse HTML with JSDOM
  const dom = new JSDOM(html, { url })
  const document = dom.window.document

  // Extract content using Readability
  const reader = new Readability(document)
  const article = reader.parse()

  if (!article || !article.textContent) {
    throw new Error("Failed to extract content from URL using Readability")
  }

  logger.addLog('content-extraction', 'success', {
    url,
    length: article.textContent.length,
    title: article.title || "No title",
    excerpt: article.excerpt?.substring(0, 200) || "No excerpt"
  })

  return {
    content: article.textContent,
    title: article.title || undefined,
    excerpt: article.excerpt || undefined
  }
}
