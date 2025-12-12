/**
 * Application configuration
 * Centralized configuration for supported domains and other app settings
 */

import { getEnvVar } from "./env"

/**
 * Supported domains for fact-checking
 * These domains are used to filter search results from Tavily API
 */
export const SUPPORTED_DOMAINS = [
  "vnexpress.net",
  "tuoitre.vn",
  "dantri.com.vn",
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
 * Reads from validated environment variables
 */
export interface AIModelConfig {
  model: string
  temperature: number
}

/**
 * Get OpenAI model configuration from validated environment variables
 * @returns Configuration object with model name and temperature
 */
export function getAIModelConfig(): AIModelConfig {
  return {
    model: getEnvVar("OPENAI_MODEL"),
    temperature: getEnvVar("OPENAI_TEMPERATURE"),
  }
}
