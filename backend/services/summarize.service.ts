import { logger } from "@/lib/logger"
import { getSummarizePrompt } from "@/config/prompts"
import { getEnvVar } from "@/config/env"
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
import type { ModelConfig } from "@/domain/types"
import { safeParseOrThrow } from "@/utils/zod-helpers"
import { calculateLexicalMetrics, saveEvaluationMetrics } from "./evaluation.service"
import { calculateBertScore } from "./bert.service"
import { calculateCompressionRate } from "./compression.service"

const PHOGPT_MODEL_NAME = 'vinai/PhoGPT-4B-Chat'
const PHOGPT_INPUT_CHAR_LIMIT = 6000

/**
 * Call the dedicated PhoGPT Gradio microservice.
 * The microservice builds its own prompt and returns JSON { summary, category, readingTime }.
 */
async function callPhoGPTService(articleText: string): Promise<SummaryData> {
  const serviceUrl = getEnvVar("PHOGPT_SERVICE_URL")
  if (!serviceUrl) throw new Error("PHOGPT_SERVICE_URL is not set")

  const timeoutMs = Number(getEnvVar("HF_TIMEOUT_MS")) || 120000

  const truncated = articleText.length > PHOGPT_INPUT_CHAR_LIMIT
    ? articleText.substring(0, PHOGPT_INPUT_CHAR_LIMIT)
    : articleText

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    // Gradio /call API: POST to initiate, then GET to stream result
    const initRes = await fetch(`${serviceUrl}/call/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [truncated] }),
      signal: controller.signal,
    })

    if (!initRes.ok) {
      const errText = await initRes.text()
      throw new Error(`PhoGPT service error ${initRes.status}: ${errText}`)
    }

    const { event_id } = await initRes.json()
    if (!event_id) {
      throw new Error('PhoGPT service returned no event_id')
    }

    // Stream result
    const resultRes = await fetch(`${serviceUrl}/call/summarize/${event_id}`, {
      signal: controller.signal,
    })

    if (!resultRes.ok) {
      const errText = await resultRes.text()
      throw new Error(`PhoGPT result error ${resultRes.status}: ${errText}`)
    }

    const resultText = await resultRes.text()

    // Gradio SSE format: "event: complete\ndata: [\"json_string\"]\n\n"
    const dataMatch = resultText.match(/^data:\s*(.+)$/m)
    if (!dataMatch) {
      throw new Error(`PhoGPT returned no data: ${resultText.substring(0, 200)}`)
    }

    const dataArray = JSON.parse(dataMatch[1])
    const rawJson = typeof dataArray[0] === 'string' ? dataArray[0] : JSON.stringify(dataArray[0])
    const parsed = JSON.parse(rawJson)

    return {
      summary: parsed.summary || '',
      category: parsed.category || 'Khác',
      readingTime: typeof parsed.readingTime === 'number' ? parsed.readingTime : 1,
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Main service function to summarize content
 * 
 * @param request - Summarize request parameters
 * @returns Summary response with summary text, key points, and reading time
 */
export async function performSummarize(request: SummarizeRequest, modelConfig?: ModelConfig): Promise<SummarizeResponse> {
  const { content, url, debug } = request

  const debugInfo: SummarizeDebugInfo = {}
  let extractedContent = ""
  let contentLength = 0
  let extractedTitle: string | undefined
  let extractedExcerpt: string | undefined

  // Extract content from URL or use provided content.
  // IMPORTANT: if the client already extracted `content` (e.g. from the browser extension
  // using client-side Readability), prefer that over re-fetching the URL server-side.
  // Server-side fetching fails for bot-protected sites (e.g. Cloudflare-protected laodong.vn).
  if (content && typeof content === "string") {
    // Use pre-extracted content directly (preferred path)
    extractedContent = content
    contentLength = content.length

    logger.addLog('summarize', 'content-input', {
      length: content.length,
      preview: content.substring(0, 200)
    })

    // Store debug information
    if (debug) {
      debugInfo.url = url
      debugInfo.extractedContent = {
        length: content.length,
        preview: content.substring(0, 500) + (content.length > 500 ? "..." : ""),
        fullContent: content
      }
    }
  } else if (url && typeof url === "string") {
    // No content provided — fetch and extract from URL server-side
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
  } else {
    throw new Error("Either 'content' (string) or 'url' (string) is required")
  }

  if (extractedContent.length === 0) {
    throw new Error("Content cannot be empty")
  }

  // PhoGPT uses a dedicated microservice — bypass the LLM pipeline
  if (modelConfig?.model_name === PHOGPT_MODEL_NAME) {
    const startTime = Date.now()
    const summaryData = await callPhoGPTService(extractedContent)
    const latency = Date.now() - startTime

    const response: SummarizeResponse = {
      summary: summaryData.summary,
      category: summaryData.category,
      readingTime: summaryData.readingTime,
      model: PHOGPT_MODEL_NAME,
      usage: undefined, // PhoGPT microservice doesn't return token counts
    }

    // Fire-and-forget evaluation metrics
    void (async () => {
      try {
        const [metrics, bertScore] = await Promise.all([
          Promise.resolve(calculateLexicalMetrics(response.summary, extractedContent)),
          calculateBertScore(extractedContent, response.summary),
        ])

        let compressionRate: number | null = null
        try {
          const result = calculateCompressionRate({
            originalText: extractedContent,
            summaryText: response.summary,
          })
          compressionRate = result.compressionRate
        } catch (crErr) {
          logger.addLog('summarize', 'compression-rate-error', {
            error: crErr instanceof Error ? crErr.message : String(crErr),
          })
        }

        await saveEvaluationMetrics({
          summary: response.summary,
          original: extractedContent,
          url: typeof url === 'string' ? url : undefined,
          metrics: { ...metrics, bert_score: bertScore, compression_rate: compressionRate, total_tokens: null },
          latency,
          mode: 'sync',
          model: PHOGPT_MODEL_NAME,
        })
      } catch (err) {
        logger.addLog('summarize', 'evaluation-error', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    })()

    if (debug) {
      response.debug = debugInfo
    }

    return response
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
      provider: modelConfig?.provider,
      model: modelConfig?.model_name,
      modelType: modelConfig?.model_type,
      temperature: modelConfig?.temperature,
      topP: modelConfig?.top_p ?? undefined,
      topK: modelConfig?.top_k ?? undefined,
      maxTokens: modelConfig?.max_tokens ?? undefined,
      frequencyPenalty: modelConfig?.frequency_penalty ?? undefined,
      presencePenalty: modelConfig?.presence_penalty ?? undefined,
      seed: modelConfig?.seed ?? undefined,
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
    model: llmResult.model,
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

      // Calculate compression rate (token-based)
      let compressionRate: number | null = null;
      try {
        const result = calculateCompressionRate({
          originalText: extractedContent,
          summaryText: response.summary,
        });
        compressionRate = result.compressionRate;
      } catch (crErr) {
        logger.addLog('summarize', 'compression-rate-error', {
          error: crErr instanceof Error ? crErr.message : String(crErr)
        });
      }

      await saveEvaluationMetrics({
        summary: response.summary,
        original: extractedContent,
        url: typeof url === 'string' ? url : undefined,
        metrics: { ...metrics, bert_score: bertScore, compression_rate: compressionRate, total_tokens: llmResult.usage?.total_tokens ?? null },
        latency,
        mode: 'sync', // full request duration
        model: llmResult.model,
        promptTokens: llmResult.usage?.prompt_tokens,
        completionTokens: llmResult.usage?.completion_tokens,
        estimatedCostUsd: modelConfig
          ? ((llmResult.usage?.prompt_tokens ?? 0) / 1_000_000 * (modelConfig.input_cost_per_1m ?? 0))
            + ((llmResult.usage?.completion_tokens ?? 0) / 1_000_000 * (modelConfig.output_cost_per_1m ?? 0))
          : undefined,
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
  request: SummarizeRequest,
  modelConfig?: ModelConfig
): AsyncGenerator<{
  type: 'summary-delta' | 'metadata' | 'error' | 'done'
  delta?: string
  summary?: string
  category?: string
  readingTime?: number
  usage?: any
  error?: string
}> {
  const { content, url, debug } = request

  let extractedContent = ""
  let contentLength = 0

  try {
    // Extract content from URL or use provided content.
    // IMPORTANT: prefer pre-extracted `content` over re-fetching the URL server-side so that
    // bot-protected sites (e.g. Cloudflare-protected laodong.vn) don't fail here.
    if (content && typeof content === "string") {
      // Use pre-extracted content from the client (preferred path)
      extractedContent = content
      contentLength = content.length

      logger.addLog('summarize-stream', 'content-input', {
        length: content.length,
      })
    } else if (url && typeof url === "string") {
      // No content provided — fetch and extract from URL server-side
      const extracted = await extractContentFromUrl(url)
      extractedContent = extracted.content
      contentLength = extracted.content.length

      logger.addLog('summarize-stream', 'content-extraction', {
        url,
        length: extractedContent.length,
        title: extracted.title || "No title",
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
      provider: modelConfig?.provider,
      model: modelConfig?.model_name,
      modelType: modelConfig?.model_type,
      temperature: modelConfig?.temperature,
      topP: modelConfig?.top_p ?? undefined,
      topK: modelConfig?.top_k ?? undefined,
      maxTokens: modelConfig?.max_tokens ?? undefined,
      frequencyPenalty: modelConfig?.frequency_penalty ?? undefined,
      presencePenalty: modelConfig?.presence_penalty ?? undefined,
      seed: modelConfig?.seed ?? undefined,
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
          summary: summaryData.summary,  // Include parsed summary for reliable extraction in route handler
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
