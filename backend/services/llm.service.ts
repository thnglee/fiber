import OpenAI from "openai"
import { GoogleGenerativeAI } from "@google/generative-ai"
import Anthropic from "@anthropic-ai/sdk"
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
  ModelConfig,
} from "@/domain/types"

// Re-export types for backward compatibility
export type { LLMCompletionOptions, LLMCompletionResult }

// ============================================================================
// Lazy-initialised SDK clients (created on first use)
// ============================================================================

let _openai: OpenAI | null = null
function getOpenAIClient(): OpenAI {
  if (!_openai) {
    const key = getEnvVar("OPENAI_API_KEY")
    if (!key) throw new Error("API key for OpenAI has not been set up")
    _openai = new OpenAI({ apiKey: key })
  }
  return _openai
}

function getGeminiClient(): GoogleGenerativeAI {
  const key = getEnvVar("GEMINI_API_KEY")
  if (!key) throw new Error("API key for Gemini has not been set up")
  return new GoogleGenerativeAI(key)
}

function getAnthropicClient(): Anthropic {
  const key = getEnvVar("ANTHROPIC_API_KEY")
  if (!key) throw new Error("API key for Anthropic has not been set up")
  return new Anthropic({ apiKey: key })
}

// ============================================================================
// JSON helpers (unchanged)
// ============================================================================

export function extractJsonFromResponse(responseText: string): string {
  const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) || responseText.match(/```\n([\s\S]*?)\n```/)
  return jsonMatch ? jsonMatch[1] : responseText
}

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

// ============================================================================
// Provider-specific completion helpers
// ============================================================================

interface CompletionResult {
  rawResponse: string
  model: string
  usage?: LLMUsage
  structuredData?: any
}

/** Build AIModelConfig from LLMCompletionOptions (merges explicit fields with defaults) */
function resolveConfig(options: LLMCompletionOptions) {
  // If the caller passed provider/model/etc directly, build a partial ModelConfig-like override
  const override: Partial<ModelConfig> | undefined =
    options.provider || options.model
      ? {
          provider: options.provider,
          model_name: options.model,
          model_type: options.modelType,
          temperature: options.temperature,
          top_p: options.topP ?? null,
          top_k: options.topK ?? null,
          max_tokens: options.maxTokens ?? null,
          frequency_penalty: options.frequencyPenalty ?? null,
          presence_penalty: options.presencePenalty ?? null,
          seed: options.seed ?? null,
        } as Partial<ModelConfig>
      : undefined

  return getAIModelConfig(override)
}

// ── OpenAI ──────────────────────────────────────────────────────────────────

async function callOpenAI(
  options: LLMCompletionOptions,
  config: ReturnType<typeof getAIModelConfig>,
  schema?: z.ZodSchema<any>
): Promise<CompletionResult> {
  const openai = getOpenAIClient()
  const isReasoning = config.modelType === 'reasoning'

  const requestParams: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
    model: config.model,
    messages: [{ role: "user", content: options.prompt }],
  }

  // Reasoning models: skip temperature, top_p, frequency_penalty, presence_penalty
  if (!isReasoning) {
    requestParams.temperature = config.temperature
    if (config.topP !== undefined) requestParams.top_p = config.topP
    if (config.frequencyPenalty !== undefined) requestParams.frequency_penalty = config.frequencyPenalty
    if (config.presencePenalty !== undefined) requestParams.presence_penalty = config.presencePenalty
  }

  // max_tokens → max_completion_tokens for OpenAI
  if (config.maxTokens !== undefined) {
    requestParams.max_completion_tokens = config.maxTokens
  }

  // seed (supported for both standard and reasoning)
  if (config.seed !== undefined) {
    requestParams.seed = config.seed
  }

  // Structured output
  if (schema) {
    const jsonSchema = zodToJsonSchema(schema, { target: "openApi3" })
    requestParams.response_format = {
      type: "json_schema",
      json_schema: { name: "structured_output", strict: true, schema: jsonSchema as any },
    }
  }

  const completion = await openai.chat.completions.create(requestParams)
  const responseText = completion.choices[0]?.message?.content || ""

  let structuredData: any = undefined
  if (schema && responseText) {
    try { structuredData = JSON.parse(responseText) } catch {}
  }

  const usage: LLMUsage | undefined = completion.usage ? {
    prompt_tokens: completion.usage.prompt_tokens,
    completion_tokens: completion.usage.completion_tokens,
    total_tokens: completion.usage.total_tokens,
  } : undefined

  return { rawResponse: responseText, model: completion.model, usage, structuredData }
}

// ── Gemini ──────────────────────────────────────────────────────────────────

async function callGemini(
  options: LLMCompletionOptions,
  config: ReturnType<typeof getAIModelConfig>,
  schema?: z.ZodSchema<any>
): Promise<CompletionResult> {
  const genAI = getGeminiClient()

  const generationConfig: Record<string, any> = {
    temperature: config.temperature,
  }
  if (config.topP !== undefined) generationConfig.topP = config.topP
  if (config.topK !== undefined) generationConfig.topK = config.topK
  if (config.maxTokens !== undefined) generationConfig.maxOutputTokens = config.maxTokens
  if (config.seed !== undefined) generationConfig.seed = config.seed

  // Structured output via responseMimeType
  if (schema) {
    const jsonSchema = zodToJsonSchema(schema, { target: "openApi3" })
    generationConfig.responseMimeType = 'application/json'
    generationConfig.responseSchema = jsonSchema
  }

  const model = genAI.getGenerativeModel({
    model: config.model,
    generationConfig,
  })

  const result = await model.generateContent(options.prompt)
  const response = result.response
  const responseText = response.text()

  let structuredData: any = undefined
  if (schema && responseText) {
    try { structuredData = JSON.parse(responseText) } catch {}
  }

  // Gemini usage metadata
  const usageMeta = response.usageMetadata
  const usage: LLMUsage | undefined = usageMeta ? {
    prompt_tokens: usageMeta.promptTokenCount,
    completion_tokens: usageMeta.candidatesTokenCount,
    total_tokens: usageMeta.totalTokenCount,
  } : undefined

  return { rawResponse: responseText, model: config.model, usage, structuredData }
}

// ── Anthropic ───────────────────────────────────────────────────────────────

async function callAnthropic(
  options: LLMCompletionOptions,
  config: ReturnType<typeof getAIModelConfig>,
  schema?: z.ZodSchema<any>
): Promise<CompletionResult> {
  const client = getAnthropicClient()

  // Anthropic temperature clamped to 0–1
  const temperature = Math.min(config.temperature, 1.0)

  const requestParams: Anthropic.MessageCreateParams = {
    model: config.model,
    max_tokens: config.maxTokens ?? 4096,
    messages: [{ role: "user", content: options.prompt }],
    temperature,
  }

  if (config.topP !== undefined) requestParams.top_p = config.topP
  if (config.topK !== undefined) requestParams.top_k = config.topK
  // Anthropic does not support seed, frequency_penalty, or presence_penalty

  // Structured output: instruct via system prompt
  if (schema) {
    const jsonSchema = zodToJsonSchema(schema, { target: "openApi3" })
    requestParams.system = `You must respond with valid JSON matching this schema. Do not include markdown code blocks, only output raw JSON.\n\nSchema:\n${JSON.stringify(jsonSchema, null, 2)}`
  }

  const message = await client.messages.create(requestParams)
  const responseText = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('')

  let structuredData: any = undefined
  if (schema && responseText) {
    try { structuredData = JSON.parse(extractJsonFromResponse(responseText)) } catch {}
  }

  const usage: LLMUsage | undefined = message.usage ? {
    prompt_tokens: message.usage.input_tokens,
    completion_tokens: message.usage.output_tokens,
    total_tokens: message.usage.input_tokens + message.usage.output_tokens,
  } : undefined

  return { rawResponse: responseText, model: message.model, usage, structuredData }
}

// ============================================================================
// Public API — generateCompletion
// ============================================================================

export async function generateCompletion(options: LLMCompletionOptions): Promise<CompletionResult> {
  const { logContext = 'llm', schema } = options
  const config = resolveConfig(options)

  logger.addLog(logContext, 'prompt', {
    promptLength: options.prompt.length,
    hasSchema: !!schema,
    provider: config.provider,
    model: config.model,
  })

  let result: CompletionResult
  switch (config.provider) {
    case 'gemini':
      result = await callGemini(options, config, schema)
      break
    case 'anthropic':
      result = await callAnthropic(options, config, schema)
      break
    case 'openai':
    default:
      result = await callOpenAI(options, config, schema)
      break
  }

  logger.addLog(logContext, 'response', {
    model: result.model,
    responseLength: result.rawResponse.length,
    usage: result.usage,
    hasStructuredOutput: !!result.structuredData,
    response: result.rawResponse.substring(0, 500)
  })

  return result
}

// ============================================================================
// Public API — generateJsonCompletion
// ============================================================================

export async function generateJsonCompletion<T>(
  options: LLMCompletionOptions & { schema: z.ZodSchema<T> },
  fallback: T
): Promise<LLMCompletionResult<T>> {
  const { debug, schema } = options

  const { rawResponse, model, usage, structuredData } = await generateCompletion({
    ...options,
    schema,
  })

  let data: T
  if (structuredData) {
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
    data = parseJsonResponse<T>(rawResponse, fallback)
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

  const debugInfo = debug ? { raw: rawResponse, model, usage } : undefined

  return { data, rawResponse, model, usage, debugInfo }
}

// ============================================================================
// Provider-specific streaming helpers
// ============================================================================

type StreamChunk<T> = {
  type: 'delta' | 'done' | 'error'
  delta?: string
  data?: T
  usage?: LLMUsage
  error?: string
}

// ── OpenAI streaming ────────────────────────────────────────────────────────

async function* streamOpenAI<T>(
  options: LLMCompletionOptions & { schema: z.ZodSchema<T> },
  config: ReturnType<typeof getAIModelConfig>
): AsyncGenerator<StreamChunk<T>> {
  const openai = getOpenAIClient()
  const isReasoning = config.modelType === 'reasoning'
  const { prompt, schema, logContext = 'llm' } = options

  const jsonSchema = zodToJsonSchema(schema, { target: "openApi3" })
  const requestParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
    model: config.model,
    messages: [{ role: "user" as const, content: prompt }],
    response_format: {
      type: "json_schema",
      json_schema: { name: "structured_output", strict: true, schema: jsonSchema as any },
    },
    stream: true,
    stream_options: { include_usage: true },
  }

  if (!isReasoning) {
    requestParams.temperature = config.temperature
    if (config.topP !== undefined) requestParams.top_p = config.topP
    if (config.frequencyPenalty !== undefined) requestParams.frequency_penalty = config.frequencyPenalty
    if (config.presencePenalty !== undefined) requestParams.presence_penalty = config.presencePenalty
  }
  if (config.maxTokens !== undefined) requestParams.max_completion_tokens = config.maxTokens
  if (config.seed !== undefined) requestParams.seed = config.seed

  const stream = await openai.chat.completions.create(requestParams)

  let accumulatedContent = ''
  let finalModel = ''
  let finalUsage: LLMUsage | undefined
  let isComplete = false
  let parsedData: T | undefined

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content || ''
    if (delta) {
      accumulatedContent += delta
      yield { type: 'delta', delta }
    }
    if (chunk.model) finalModel = chunk.model
    if (chunk.usage) {
      finalUsage = {
        prompt_tokens: chunk.usage.prompt_tokens,
        completion_tokens: chunk.usage.completion_tokens,
        total_tokens: chunk.usage.total_tokens,
      }
      console.log('[LLM Streaming] ✅ Usage data captured from chunk:', finalUsage)
    }
    const finishReason = chunk.choices[0]?.finish_reason
    if (finishReason === 'stop') {
      isComplete = true
      logger.addLog(logContext, 'streaming-complete', { model: finalModel, contentLength: accumulatedContent.length, usage: finalUsage })
      try {
        const parsed = JSON.parse(accumulatedContent)
        parsedData = safeParseOrThrow(schema, parsed, "Streaming structured output validation")
      } catch (error) {
        logger.addLog(logContext, 'streaming-parse-error', { error: error instanceof Error ? error.message : String(error) })
        yield { type: 'error', error: error instanceof Error ? error.message : 'Failed to parse streaming response' }
        return
      }
    } else if (finishReason === 'length') {
      yield { type: 'error', error: 'Response truncated due to max tokens limit' }; return
    } else if (finishReason === 'content_filter') {
      yield { type: 'error', error: 'Response filtered due to content policy' }; return
    }
  }

  if (isComplete && parsedData) {
    console.log('[LLM Streaming] ✅ Yielding final data with usage:', finalUsage)
    yield { type: 'done', data: parsedData, usage: finalUsage }
  }
}

// ── Gemini streaming ────────────────────────────────────────────────────────

async function* streamGemini<T>(
  options: LLMCompletionOptions & { schema: z.ZodSchema<T> },
  config: ReturnType<typeof getAIModelConfig>
): AsyncGenerator<StreamChunk<T>> {
  const genAI = getGeminiClient()
  const { prompt, schema, logContext = 'llm' } = options

  const generationConfig: Record<string, any> = { temperature: config.temperature }
  if (config.topP !== undefined) generationConfig.topP = config.topP
  if (config.topK !== undefined) generationConfig.topK = config.topK
  if (config.maxTokens !== undefined) generationConfig.maxOutputTokens = config.maxTokens
  if (config.seed !== undefined) generationConfig.seed = config.seed

  const jsonSchema = zodToJsonSchema(schema, { target: "openApi3" })
  generationConfig.responseMimeType = 'application/json'
  generationConfig.responseSchema = jsonSchema

  const model = genAI.getGenerativeModel({ model: config.model, generationConfig })
  const result = await model.generateContentStream(prompt)

  let accumulatedContent = ''
  let finalUsage: LLMUsage | undefined

  for await (const chunk of result.stream) {
    const text = chunk.text()
    if (text) {
      accumulatedContent += text
      yield { type: 'delta', delta: text }
    }
    if (chunk.usageMetadata) {
      finalUsage = {
        prompt_tokens: chunk.usageMetadata.promptTokenCount,
        completion_tokens: chunk.usageMetadata.candidatesTokenCount,
        total_tokens: chunk.usageMetadata.totalTokenCount,
      }
    }
  }

  // Parse accumulated JSON
  if (accumulatedContent) {
    try {
      const parsed = JSON.parse(accumulatedContent)
      const data = safeParseOrThrow(schema, parsed, "Gemini streaming structured output validation") as T
      logger.addLog(logContext, 'streaming-complete', { model: config.model, contentLength: accumulatedContent.length, usage: finalUsage })
      yield { type: 'done', data, usage: finalUsage }
    } catch (error) {
      logger.addLog(logContext, 'streaming-parse-error', { error: error instanceof Error ? error.message : String(error) })
      yield { type: 'error', error: error instanceof Error ? error.message : 'Failed to parse Gemini streaming response' }
    }
  }
}

// ── Anthropic streaming ─────────────────────────────────────────────────────

async function* streamAnthropic<T>(
  options: LLMCompletionOptions & { schema: z.ZodSchema<T> },
  config: ReturnType<typeof getAIModelConfig>
): AsyncGenerator<StreamChunk<T>> {
  const client = getAnthropicClient()
  const { prompt, schema, logContext = 'llm' } = options

  const temperature = Math.min(config.temperature, 1.0)
  const jsonSchemaObj = zodToJsonSchema(schema, { target: "openApi3" })

  const requestParams: Anthropic.MessageCreateParams = {
    model: config.model,
    max_tokens: config.maxTokens ?? 4096,
    messages: [{ role: "user", content: prompt }],
    temperature,
    system: `You must respond with valid JSON matching this schema. Do not include markdown code blocks, only output raw JSON.\n\nSchema:\n${JSON.stringify(jsonSchemaObj, null, 2)}`,
    stream: true,
  }

  if (config.topP !== undefined) requestParams.top_p = config.topP
  if (config.topK !== undefined) requestParams.top_k = config.topK

  const stream = client.messages.stream(requestParams)
  let accumulatedContent = ''
  let finalUsage: LLMUsage | undefined
  let finalModel = config.model

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      const text = event.delta.text
      accumulatedContent += text
      yield { type: 'delta', delta: text }
    } else if (event.type === 'message_start' && event.message) {
      finalModel = event.message.model
      if (event.message.usage) {
        finalUsage = {
          prompt_tokens: event.message.usage.input_tokens,
          completion_tokens: 0,
          total_tokens: event.message.usage.input_tokens,
        }
      }
    } else if (event.type === 'message_delta') {
      // Final usage from message_delta
      const delta = event as any
      if (delta.usage) {
        finalUsage = {
          prompt_tokens: finalUsage?.prompt_tokens ?? 0,
          completion_tokens: delta.usage.output_tokens ?? 0,
          total_tokens: (finalUsage?.prompt_tokens ?? 0) + (delta.usage.output_tokens ?? 0),
        }
      }
    }
  }

  // Parse accumulated JSON
  if (accumulatedContent) {
    try {
      const cleanedText = extractJsonFromResponse(accumulatedContent)
      const parsed = JSON.parse(cleanedText)
      const data = safeParseOrThrow(schema, parsed, "Anthropic streaming structured output validation") as T
      logger.addLog(logContext, 'streaming-complete', { model: finalModel, contentLength: accumulatedContent.length, usage: finalUsage })
      yield { type: 'done', data, usage: finalUsage }
    } catch (error) {
      logger.addLog(logContext, 'streaming-parse-error', { error: error instanceof Error ? error.message : String(error) })
      yield { type: 'error', error: error instanceof Error ? error.message : 'Failed to parse Anthropic streaming response' }
    }
  }
}

// ============================================================================
// Public API — generateStreamingCompletion
// ============================================================================

export async function* generateStreamingCompletion<T>(
  options: LLMCompletionOptions & { schema: z.ZodSchema<T> }
): AsyncGenerator<StreamChunk<T>> {
  const { logContext = 'llm' } = options
  const config = resolveConfig(options)

  logger.addLog(logContext, 'streaming-prompt', {
    promptLength: options.prompt.length,
    hasSchema: true,
    provider: config.provider,
    model: config.model,
  })

  try {
    switch (config.provider) {
      case 'gemini':
        yield* streamGemini(options, config)
        break
      case 'anthropic':
        yield* streamAnthropic(options, config)
        break
      case 'openai':
      default:
        yield* streamOpenAI(options, config)
        break
    }
  } catch (error) {
    logger.addLog(logContext, 'streaming-error', {
      error: error instanceof Error ? error.message : String(error)
    })
    yield { type: 'error', error: error instanceof Error ? error.message : 'Streaming request failed' }
  }
}
