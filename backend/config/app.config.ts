/**
 * Application configuration
 * Centralized configuration for supported domains and other app settings
 */

import { getEnvVar } from "./env"
import type { ModelConfig } from "@/domain/types"

/**
 * Supported domains for fact-checking
 * These domains are used to filter search results from Tavily API
 */
export const SUPPORTED_DOMAINS = [
  "tuoitre.vn",
  "thanhnien.vn",
  "vietnamnet.vn", // Added
  "laodong.vn",    // Added
  "tienphong.vn",  // Added
  "vtv.vn",        // Added
  "nld.com.vn"     // Added
] as const

/**
 * Get supported domains as an array
 * Useful for API calls that require an array
 */
export function getSupportedDomains(): string[] {
  return [...SUPPORTED_DOMAINS]
}

/**
 * AI Model Configuration
 */
export interface AIModelConfig {
  provider: 'openai' | 'gemini' | 'anthropic' | 'huggingface'
  model: string
  modelType: 'standard' | 'reasoning' | 'chat' | 'base'
  temperature: number
  topP?: number
  topK?: number
  maxTokens?: number
  frequencyPenalty?: number
  presencePenalty?: number
  seed?: number
}

/**
 * Get AI model configuration, optionally overridden by a ModelConfig from Supabase.
 * Without an override, falls back to env-based OpenAI defaults.
 */
export function getAIModelConfig(override?: Partial<ModelConfig>): AIModelConfig {
  return {
    provider:         override?.provider         ?? 'openai',
    model:            override?.model_name       ?? getEnvVar("OPENAI_MODEL"),
    modelType:        override?.model_type       ?? 'standard',
    temperature:      override?.temperature      ?? getEnvVar("OPENAI_TEMPERATURE"),
    topP:             override?.top_p            ?? undefined,
    topK:             override?.top_k            ?? undefined,
    maxTokens:        override?.max_tokens       ?? undefined,
    frequencyPenalty: override?.frequency_penalty ?? undefined,
    presencePenalty:  override?.presence_penalty  ?? undefined,
    seed:             override?.seed             ?? undefined,
  }
}
