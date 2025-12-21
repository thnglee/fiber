import OpenAI from "openai"
import { z } from "zod"
import { zodToJsonSchema } from "zod-to-json-schema"
import { logger } from "@/lib/logger"
import { getAIModelConfig } from "@/config/app.config"
import { getEnvVar } from "@/config/env"
import { safeParseOrThrow } from "@/utils/zod-helpers"
import type {
  LLMCompletionOptions,
  LLMCompletionResult,
  LLMUsage,
} from "@/domain/types"

const openai = new OpenAI({ apiKey: getEnvVar("OPENAI_API_KEY") })

// Re-export types for backward compatibility
export type { LLMCompletionOptions, LLMCompletionResult }

/**
 * Extract JSON from LLM response, handling markdown code blocks
 * (Fallback for non-structured outputs)
 */
export function extractJsonFromResponse(responseText: string): string {
  const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) || responseText.match(/```\n([\s\S]*?)\n```/)
  return jsonMatch ? jsonMatch[1] : responseText
}

/**
 * Parse JSON from LLM response with fallback handling
 * (Fallback for non-structured outputs)
 */
export function parseJsonResponse<T>(responseText: string, fallback: T): T {
  try {
    const jsonText = extractJsonFromResponse(responseText)
    return JSON.parse(jsonText.trim()) as T
  } catch (error) {
    logger.addLog('llm', 'json-parse-error', {
      error: error instanceof Error ? error.message : String(error),
      responsePreview: responseText.substring(0, 200)
    })
    return fallback
  }
}

/**
 * Generate completion using OpenAI with optional structured output
 * 
 * @param options - Completion options
 * @returns LLM completion result
 */
export async function generateCompletion(options: LLMCompletionOptions): Promise<{
  rawResponse: string
  model: string
  usage?: LLMUsage
  structuredData?: any // Parsed structured data if schema was provided
}> {
  const { prompt, debug, logContext = 'llm', schema } = options

  logger.addLog(logContext, 'prompt', {
    promptLength: prompt.length,
    hasSchema: !!schema
  })

  const aiConfig = getAIModelConfig()

  // Prepare request parameters
  const requestParams: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
    model: aiConfig.model,
    messages: [
      {
        role: "user",
        content: prompt
      }
    ],
    temperature: aiConfig.temperature,
  }

  // Add structured output if schema is provided
  let parsed: any = undefined
  if (schema) {
    const jsonSchema = zodToJsonSchema(schema, { target: "openApi3" })
    requestParams.response_format = {
      type: "json_schema",
      json_schema: {
        name: "structured_output",
        strict: true,
        schema: jsonSchema as any,
      },
    }
  }

  const completion = await openai.chat.completions.create(requestParams)

  const responseText = completion.choices[0]?.message?.content || ""

  // Parse structured output if schema was provided
  if (schema && responseText) {
    try {
      parsed = JSON.parse(responseText)
    } catch (error) {
      // If parsing fails, structured output will be undefined and we'll fall back to text parsing
      logger.addLog(logContext, 'structured-output-parse-error', {
        error: error instanceof Error ? error.message : String(error),
        responsePreview: responseText.substring(0, 200)
      })
    }
  }

  logger.addLog(logContext, 'response', {
    model: completion.model,
    responseLength: responseText.length,
    usage: completion.usage,
    hasStructuredOutput: !!parsed,
    response: responseText.substring(0, 500)
  })

  // Convert OpenAI usage to domain LLMUsage type
  const usage: LLMUsage | undefined = completion.usage ? {
    prompt_tokens: completion.usage.prompt_tokens,
    completion_tokens: completion.usage.completion_tokens,
    total_tokens: completion.usage.total_tokens,
  } : undefined

  return {
    rawResponse: responseText,
    model: completion.model,
    usage,
    structuredData: parsed
  }
}

/**
 * Generate completion and parse as JSON using Zod schema for structured output
 * 
 * @param options - Completion options (must include schema)
 * @param schema - Zod schema for validation and structured output
 * @param fallback - Fallback value if parsing/validation fails
 * @returns Parsed and validated JSON result with metadata
 */
export async function generateJsonCompletion<T>(
  options: LLMCompletionOptions & { schema: z.ZodSchema<T> },
  fallback: T
): Promise<LLMCompletionResult<T>> {
  const { debug, schema } = options

  const { rawResponse, model, usage, structuredData } = await generateCompletion({
    ...options,
    schema,
  })

  // Use structured output if available, otherwise fall back to parsing
  let data: T
  if (structuredData) {
    // Validate structured output against schema
    try {
      data = safeParseOrThrow(schema, structuredData, "LLM structured output validation")
    } catch (error) {
      logger.addLog('llm', 'schema-validation-error', {
        error: error instanceof Error ? error.message : String(error),
        structuredData: JSON.stringify(structuredData).substring(0, 200)
      })
      data = fallback
    }
  } else {
    // Fallback to text parsing (for older models or when structured output fails)
    data = parseJsonResponse<T>(rawResponse, fallback)
    // Validate parsed data against schema
    try {
      data = safeParseOrThrow(schema, data, "LLM response validation")
    } catch (error) {
      logger.addLog('llm', 'schema-validation-error', {
        error: error instanceof Error ? error.message : String(error),
        parsedData: JSON.stringify(data).substring(0, 200)
      })
      data = fallback
    }
  }

  // Only include debug info when debug mode is enabled
  const debugInfo = debug ? {
    raw: rawResponse,
    model,
    usage  // Include usage in debug info for backward compatibility
  } : undefined

  return {
    data,
    rawResponse,
    model,
    usage,  // ✅ Always return usage at top level for tracking, regardless of debug mode
    debugInfo
  }
}

/**
 * Stream completion using OpenAI with structured output
 * Based on OpenAI's official streaming structured output API
 * 
 * @param options - Completion options (must include schema)
 * @yields Progressive updates with deltas, final data, and metadata
 */
export async function* generateStreamingCompletion<T>(
  options: LLMCompletionOptions & { schema: z.ZodSchema<T> }
): AsyncGenerator<{
  type: 'delta' | 'done' | 'error'
  delta?: string
  data?: T
  usage?: LLMUsage
  error?: string
}> {
  const { prompt, debug, logContext = 'llm', schema } = options

  logger.addLog(logContext, 'streaming-prompt', {
    promptLength: prompt.length,
    hasSchema: true
  })

  const aiConfig = getAIModelConfig()

  // Prepare request parameters with structured output
  const jsonSchema = zodToJsonSchema(schema, { target: "openApi3" })
  const requestParams: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
    model: aiConfig.model,
    messages: [
      {
        role: "user",
        content: prompt
      }
    ],
    temperature: aiConfig.temperature,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "structured_output",
        strict: true,
        schema: jsonSchema as any,
      },
    },
    stream: true, // Enable streaming
    stream_options: {
      include_usage: true  // ✅ Include token usage in final chunk
    }
  } as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming

  try {
    const stream = await openai.chat.completions.create(requestParams)

    let accumulatedContent = ''
    let finalModel = ''
    let finalUsage: LLMUsage | undefined

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || ''

      // Accumulate content
      if (delta) {
        accumulatedContent += delta

        // Yield delta for progressive rendering
        yield {
          type: 'delta',
          delta
        }
      }

      // Capture model name
      if (chunk.model) {
        finalModel = chunk.model
      }

      // Capture usage information (usually in the last chunk)
      if (chunk.usage) {
        finalUsage = {
          prompt_tokens: chunk.usage.prompt_tokens,
          completion_tokens: chunk.usage.completion_tokens,
          total_tokens: chunk.usage.total_tokens,
        }
        console.log('[LLM Streaming] ✅ Usage data captured from chunk:', finalUsage)
      }

      // Check for finish reason
      const finishReason = chunk.choices[0]?.finish_reason
      if (finishReason === 'stop') {
        // Stream completed successfully
        logger.addLog(logContext, 'streaming-complete', {
          model: finalModel,
          contentLength: accumulatedContent.length,
          usage: finalUsage
        })

        // Parse and validate accumulated JSON
        try {
          const parsed = JSON.parse(accumulatedContent)
          const validated: T = safeParseOrThrow(schema, parsed, "Streaming structured output validation")

          // Yield final structured data
          yield {
            type: 'done',
            data: validated,
            usage: finalUsage
          }
        } catch (error) {
          logger.addLog(logContext, 'streaming-parse-error', {
            error: error instanceof Error ? error.message : String(error),
            contentPreview: accumulatedContent.substring(0, 200)
          })

          yield {
            type: 'error',
            error: error instanceof Error ? error.message : 'Failed to parse streaming response'
          }
        }
      } else if (finishReason === 'length') {
        yield {
          type: 'error',
          error: 'Response truncated due to max tokens limit'
        }
      } else if (finishReason === 'content_filter') {
        yield {
          type: 'error',
          error: 'Response filtered due to content policy'
        }
      }
    }
  } catch (error) {
    logger.addLog(logContext, 'streaming-error', {
      error: error instanceof Error ? error.message : String(error)
    })

    yield {
      type: 'error',
      error: error instanceof Error ? error.message : 'Streaming request failed'
    }
  }
}
