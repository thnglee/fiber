/**
 * Shared types for API responses and component props
 * 
 * This file re-exports types from shared/types.ts (shared with backend)
 * and extension-types.ts (extension-specific internal types)
 */

// Re-export shared API types
export type {
  FactCheckResponse,
  SummaryResponse,
  ApiError,
  TrustLevel,
  FactCheckResult,
} from "../../shared/types"

// Re-export extension-specific types
export type {
  SelectionState,
  ModalType,
  ModalState,
  PageDetectionResult,
  ContentExtractionResult,
  PageContext,
  WaitForContentOptions,
  ElementDimensions,
  ViewportPosition,
} from "./extension-types"

/**
 * Type guard to check if a value is a valid FactCheckResponse
 */
export function isFactCheckResponse(value: unknown): value is import("../../shared/types").FactCheckResponse {
  if (!value || typeof value !== "object") return false
  const obj = value as Record<string, unknown>

  return (
    typeof obj.score === "number" &&
    typeof obj.reason === "string" &&
    Array.isArray(obj.sources) &&
    typeof obj.verified === "boolean"
  )
}

/**
 * Type guard to check if a value is a valid SummaryResponse
 */
export function isSummaryResponse(value: unknown): value is import("../../shared/types").SummaryResponse {
  if (!value || typeof value !== "object") return false
  const obj = value as Record<string, unknown>

  return (
    typeof obj.summary === "string" &&
    typeof obj.category === "string" &&
    typeof obj.readingTime === "number"
  )
}

/**
 * Type guard to check if a value is a valid ApiError
 */
export function isApiError(value: unknown): value is import("../../shared/types").ApiError {
  if (!value || typeof value !== "object") return false
  const obj = value as Record<string, unknown>

  return typeof obj.message === "string"
}

