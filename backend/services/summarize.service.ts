import { logger } from "@/lib/logger"
import { getSummarizePrompt } from "@/config/prompts"
import { extractContentFromUrl } from "./content-extraction.service"
import { generateJsonCompletion } from "./llm.service"
import {
  SummarizeRequestSchema,
  SummarizeResponseSchema,
  SummaryDataSchema,
  type SummarizeRequest,
  type SummarizeResponse,
  type SummarizeDebugInfo,
  type SummaryData,
} from "@/domain/schemas"
import { safeParseOrThrow } from "@/utils/zod-helpers"
import { calculateLexicalMetrics, saveEvaluationMetrics } from "./evaluation.service"
import { calculateBertScore } from "./bert.service"

/**
 * Main service function to summarize content
 * 
 * @param request - Summarize request parameters
 * @returns Summary response with summary text, key points, and reading time
 */
export async function performSummarize(request: SummarizeRequest): Promise<SummarizeResponse> {
  const { content, url, debug } = request

  const debugInfo: SummarizeDebugInfo = {}
  let extractedContent = ""
  let contentLength = 0
  let extractedTitle: string | undefined
  let extractedExcerpt: string | undefined

  // Extract content from URL or use provided content
  if (url && typeof url === "string") {
    const extracted = await extractContentFromUrl(url)
    extractedContent = extracted.content
    contentLength = extracted.content.length
    extractedTitle = extracted.title
    extractedExcerpt = extracted.excerpt

    logger.addLog('summarize', 'content-extraction', {
      url,
      length: extractedContent.length,
      title: extracted.title || "No title",
      excerpt: extracted.excerpt?.substring(0, 200) || "No excerpt"
    })

    // Store debug information about the extraction
    if (debug) {
      debugInfo.url = url
      debugInfo.extractedContent = {
        length: extractedContent.length,
        preview: extractedContent.substring(0, 500) + (extractedContent.length > 500 ? "..." : ""),
        fullContent: extractedContent,
        title: extracted.title,
        excerpt: extracted.excerpt
      }
    }
  } else if (content && typeof content === "string") {
    // Use provided content directly
    extractedContent = content
    contentLength = content.length

    logger.addLog('summarize', 'content-input', {
      length: content.length,
      preview: content.substring(0, 200)
    })

    // Store debug information
    if (debug) {
      debugInfo.extractedContent = {
        length: content.length,
        preview: content.substring(0, 500) + (content.length > 500 ? "..." : ""),
        fullContent: content
      }
    }
  } else {
    throw new Error("Either 'content' (string) or 'url' (string) is required")
  }

  if (extractedContent.length === 0) {
    throw new Error("Content cannot be empty")
  }

  // Generate prompt using template
  const prompt = getSummarizePrompt({ content: extractedContent })
  if (debug) {
    debugInfo.prompt = prompt
  }

  // Generate summary using centralized LLM service with Zod structured output
  const startTime = Date.now()
  const fallbackData: SummaryData = {
    summary: extractedContent.substring(0, 500),
    category: extractedTitle || "Khác",
    readingTime: Math.ceil(contentLength / 1000) // Rough estimate: 1000 chars per minute
  }

  const llmResult = await generateJsonCompletion<SummaryData>(
    {
      prompt,
      debug,
      logContext: 'summarize',
      schema: SummaryDataSchema,
    },
    fallbackData
  )
  const latency = Date.now() - startTime

  // Validate LLM response against schema
  let summaryData: SummaryData
  try {
    summaryData = safeParseOrThrow(
      SummaryDataSchema,
      llmResult.data,
      "Summary LLM response"
    )
  } catch (error) {
    // Fallback: create structure from raw response text if validation fails
    logger.addLog('summarize', 'schema-validation-fallback', {
      error: error instanceof Error ? error.message : String(error),
    })
    const lines = llmResult.rawResponse.split("\n").filter(l => l.trim())
    summaryData = {
      summary: lines[0] || llmResult.rawResponse.substring(0, 500),
      // If we can't parse structured JSON, try to infer category from the next non-empty line,
      // otherwise default to "Khác"
      category: lines[1] || "Khác",
      readingTime: Math.ceil(contentLength / 1000)
    }
    // Validate fallback data
    summaryData = safeParseOrThrow(
      SummaryDataSchema,
      summaryData,
      "Summary fallback data"
    )
  }

  if (debug && llmResult.debugInfo) {
    debugInfo.openaiResponse = llmResult.debugInfo
  }

  // Build response and validate it
  const responseData: Omit<SummarizeResponse, "debug"> = {
    summary: summaryData.summary,
    category: summaryData.category,
    readingTime: summaryData.readingTime,
    usage: llmResult.usage, // Include usage for tracking
  }

  // Validate response before returning
  const response = safeParseOrThrow(
    SummarizeResponseSchema.omit({ debug: true }),
    responseData,
    "Summarize response"
  ) as SummarizeResponse

  logger.addLog('summarize', 'output', {
    summary: response.summary,
    category: response.category,
    readingTime: response.readingTime
  })

  // Calculate and save evaluation metrics asynchronously
  // Fire and forget — never blocks the main response.
  // BERTScore and lexical metrics run in parallel to minimise wall-clock time.
  void (async () => {
    try {
      const [metrics, bertScore] = await Promise.all([
        Promise.resolve(calculateLexicalMetrics(response.summary, extractedContent)),
        calculateBertScore(extractedContent, response.summary),
      ]);
      await saveEvaluationMetrics({
        summary: response.summary,
        original: extractedContent,
        url: typeof url === 'string' ? url : undefined,
        metrics: { ...metrics, bert_score: bertScore },
        latency
      });
    } catch (err) {
      logger.addLog('summarize', 'evaluation-error', { 
        error: err instanceof Error ? err.message : String(err) 
      });
    }
  })();

  if (debug) {
    response.debug = debugInfo
  }

  return response
}

/**
 * Stream summarization with progressive text rendering
 * Based on OpenAI's streaming structured output API
 * 
 * @param request - Summarize request parameters
 * @yields Progressive updates with summary deltas and final metadata
 */
export async function* performSummarizeStream(
  request: SummarizeRequest
): AsyncGenerator<{
  type: 'summary-delta' | 'metadata' | 'error' | 'done'
  delta?: string
  category?: string
  readingTime?: number
  usage?: any
  error?: string
}> {
  const { content, url, debug } = request

  let extractedContent = ""
  let contentLength = 0

  try {
    // Extract content from URL or use provided content
    if (url && typeof url === "string") {
      const extracted = await extractContentFromUrl(url)
      extractedContent = extracted.content
      contentLength = extracted.content.length

      logger.addLog('summarize-stream', 'content-extraction', {
        url,
        length: extractedContent.length,
        title: extracted.title || "No title",
      })
    } else if (content && typeof content === "string") {
      extractedContent = content
      contentLength = content.length

      logger.addLog('summarize-stream', 'content-input', {
        length: content.length,
      })
    } else {
      yield {
        type: 'error',
        error: "Either 'content' (string) or 'url' (string) is required"
      }
      return
    }

    if (extractedContent.length === 0) {
      yield {
        type: 'error',
        error: "Content cannot be empty"
      }
      return
    }

    // Generate prompt
    const prompt = getSummarizePrompt({ content: extractedContent })

    // Import streaming function
    const { generateStreamingCompletion } = await import("./llm.service")

    // Stream summary using LLM service
    for await (const chunk of generateStreamingCompletion<SummaryData>({
      prompt,
      debug,
      logContext: 'summarize-stream',
      schema: SummaryDataSchema,
    })) {
      if (chunk.type === 'delta' && chunk.delta) {
        // Stream summary text progressively
        // Note: OpenAI returns the full JSON progressively, so we need to extract just the summary field
        // For now, we'll yield the delta as-is and let the frontend handle it
        yield {
          type: 'summary-delta',
          delta: chunk.delta
        }
      } else if (chunk.type === 'done' && chunk.data) {
        // Validate the structured data
        const summaryData = safeParseOrThrow(
          SummaryDataSchema,
          chunk.data,
          "Streaming summary data"
        )

        // Send metadata separately
        console.log('[Summarize Stream] Sending metadata with usage:', chunk.usage)
        yield {
          type: 'metadata',
          category: summaryData.category,
          readingTime: summaryData.readingTime,
          usage: chunk.usage
        }

        // Signal completion
        yield {
          type: 'done'
        }

        logger.addLog('summarize-stream', 'complete', {
          category: summaryData.category,
          readingTime: summaryData.readingTime
        })

        // NOTE: Evaluation metrics are now saved in the route handler
        // to ensure they complete before the stream closes
      } else if (chunk.type === 'error') {
        yield {
          type: 'error',
          error: chunk.error || 'Streaming failed'
        }
      }
    }
  } catch (error) {
    logger.addLog('summarize-stream', 'error', {
      error: error instanceof Error ? error.message : String(error)
    })

    yield {
      type: 'error',
      error: error instanceof Error ? error.message : 'Failed to stream summary'
    }
  }
}
