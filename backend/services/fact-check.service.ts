import { logger } from "@/lib/logger"
import { getFactCheckPrompt } from "@/config/prompts"
import { searchSources } from "./search.service"
import { generateJsonCompletion } from "./llm.service"
import {
  FactCheckRequestSchema,
  FactCheckResponseSchema,
  FactCheckDataSchema,
  type FactCheckRequest,
  type FactCheckResponse,
  type FactCheckDebugInfo,
  type FactCheckData,
} from "@/domain/schemas"
import { safeParseOrThrow } from "@/utils/zod-helpers"

/**
 * Main service function to fact-check text
 * 
 * @param request - Fact-check request parameters
 * @returns Fact-check response with score, reason, sources, and verification status
 */
export async function performFactCheck(request: FactCheckRequest): Promise<FactCheckResponse> {
  const { text, debug } = request

  // Store debug information
  const debugInfo: FactCheckDebugInfo = {
    selectedText: text
  }

  logger.addLog('fact-check', 'input', {
    text: text.substring(0, 200)
  })

  // Search for sources using centralized search service
  const searchResult = await searchSources({
    query: text,
    maxResults: 6,
    debug
  })

  if (debug && searchResult.debugInfo) {
    debugInfo.tavilySearch = searchResult.debugInfo
  }

  // Generate prompt using template
  const prompt = getFactCheckPrompt({
    text,
    sourceContent: searchResult.sourceContent
  })

  if (debug) {
    debugInfo.augmentedPrompt = prompt
  }

  // Generate fact-check analysis using centralized LLM service with Zod structured output
  const fallbackData: FactCheckData = {
    score: 50,
    reason: "Không thể xác minh thông tin này với các nguồn hiện có.",
    verified: false
  }

  const llmResult = await generateJsonCompletion<FactCheckData>(
    {
      prompt,
      debug,
      logContext: 'fact-check',
      schema: FactCheckDataSchema,
    },
    fallbackData
  )

  if (debug && llmResult.debugInfo) {
    debugInfo.openaiResponse = llmResult.debugInfo
  }

  // Validate LLM response against schema
  const factCheckData = safeParseOrThrow(
    FactCheckDataSchema,
    llmResult.data,
    "Fact-check LLM response"
  )

  // Build response and validate it
  const responseData: Omit<FactCheckResponse, "debug"> = {
    score: factCheckData.score,
    reason: factCheckData.reason,
    sources: searchResult.sources,
    verified: factCheckData.verified,
  }

  // Validate response before returning
  const response = safeParseOrThrow(
    FactCheckResponseSchema.omit({ debug: true }),
    responseData,
    "Fact-check response"
  ) as FactCheckResponse

  logger.addLog('fact-check', 'output', {
    score: response.score,
    verified: response.verified,
    reason: response.reason,
    sources: response.sources || [],
    sourcesCount: searchResult.sources.length
  })

  if (debug) {
    response.debug = debugInfo
  }

  return response
}
