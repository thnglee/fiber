/**
 * Domain Types
 * 
 * Core domain types extracted from schemas and used across the application.
 * These types represent the business domain entities and their relationships.
 * 
 * Note: Types are inferred from Zod schemas in schemas.ts for single source of truth.
 * This file provides additional domain-specific types and utilities.
 */

import type {
  FactCheckRequest,
  FactCheckResponse,
  FactCheckDebugInfo,
  FactCheckData,
  SummarizeRequest,
  SummarizeResponse,
  SummarizeDebugInfo,
  SummaryData,
  LogEntry,
  Env,
} from "./schemas"

// Import shared types used by both extension and backend
import type {
  TrustLevel,
  FactCheckResult as SharedFactCheckResult,
} from "../../shared/types"

// Re-export schema-inferred types for convenience
export type {
  FactCheckRequest,
  FactCheckResponse,
  FactCheckDebugInfo,
  FactCheckData,
  SummarizeRequest,
  SummarizeResponse,
  SummarizeDebugInfo,
  SummaryData,
  LogEntry,
  Env,
}

// Re-export shared types
export type { TrustLevel }

// ============================================================================
// Fact Check Domain Types
// ============================================================================

/**
 * Fact check result with trust level classification
 * Extended from shared type to include verified field
 */
export interface FactCheckResult extends SharedFactCheckResult {
  verified: boolean
}

/**
 * Helper function to determine trust level from score
 */
export function getTrustLevel(score: number): TrustLevel {
  if (score >= 70) return "high"
  if (score >= 40) return "medium"
  return "low"
}

/**
 * Convert FactCheckResponse to FactCheckResult with trust level
 */
export function toFactCheckResult(response: FactCheckResponse): FactCheckResult {
  return {
    score: response.score,
    level: getTrustLevel(response.score),
    reason: response.reason,
    sources: response.sources,
    verified: response.verified,
  }
}

// ============================================================================
// Search Domain Types
// ============================================================================

/**
 * Search options for source discovery
 */
export interface SearchOptions {
  query: string
  maxResults?: number
  searchDepth?: "basic" | "advanced"
  domains?: string[]
  debug?: boolean
}

/**
 * Individual search result from Tavily API
 */
export interface SearchResult {
  title: string
  url: string
  content: string
  score: number
}

/**
 * Search response with aggregated sources and content
 */
export interface SearchResponse {
  sources: string[]
  sourceContent: string
  results: SearchResult[]
  debugInfo?: SearchDebugInfo
}

/**
 * Debug information for search operations
 */
export interface SearchDebugInfo {
  query: string
  resultsCount: number
  results: Array<{
    title: string
    url: string
    content: string
    contentLength: number
    score: number
  }>
}

// ============================================================================
// Content Extraction Domain Types
// ============================================================================

/**
 * Extracted content from a URL
 */
export interface ExtractedContent {
  content: string
  title?: string
  excerpt?: string
}

// ============================================================================
// LLM Domain Types
// ============================================================================

/**
 * Options for LLM completion requests
 */
export interface LLMCompletionOptions {
  prompt: string
  debug?: boolean
  logContext?: string
  schema?: any // Zod schema for structured output (z.ZodSchema<any>)
}

/**
 * Token usage information from LLM completion
 */
export interface LLMUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

/**
 * Result from LLM completion with parsed data
 */
export interface LLMCompletionResult<T = any> {
  data: T
  rawResponse: string
  model: string
  usage?: LLMUsage
  debugInfo?: {
    raw: string
    model: string
    usage?: LLMUsage
  }
}

// ============================================================================
// Logging Domain Types
// ============================================================================

/**
 * Log type categories
 */
export type LogType = "fact-check" | "summarize" | "search" | "llm" | "content-extraction" | "api"

/**
 * Log stage/phase within a process
 */
export type LogStage =
  | "input"
  | "output"
  | "prompt"
  | "response"
  | "content-extraction"
  | "content-input"
  | "schema-validation-fallback"
  | "json-parse-error"
  | "structured-output-parse-error"
  | "schema-validation-error"

/**
 * Log entry with typed category
 */
export interface TypedLogEntry extends Omit<LogEntry, "type" | "stage"> {
  type: LogType
  stage: LogStage
}

// ============================================================================
// API Error Types
// ============================================================================

/**
 * Standard API error response
 */
export interface ApiError {
  error: string
  message?: string
  code?: string
  details?: any
  hint?: string
}

/**
 * API response wrapper for consistent responses
 */
export interface ApiResponse<T = any> {
  data?: T
  error?: ApiError
  success: boolean
}

// ============================================================================
// HTTP Request/Response Types
// ============================================================================

/**
 * HTTP method types
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS"

/**
 * CORS headers configuration
 */
export interface CorsHeaders {
  "Access-Control-Allow-Origin": string
  "Access-Control-Allow-Methods": string
  "Access-Control-Allow-Headers": string
  "Access-Control-Max-Age"?: string
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Make specific properties optional
 */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

/**
 * Make specific properties required
 */
export type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>

/**
 * Extract debug info type from response types
 */
export type DebugInfo<T> = T extends { debug?: infer D } ? D : never

/**
 * Response type without debug info
 */
export type ResponseWithoutDebug<T> = Omit<T, "debug">
