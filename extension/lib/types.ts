/**
 * Shared types for API responses and component props
 */

export interface FactCheckResponse {
  score: number; // 0-100 trust score
  reason: string;
  sources: string[];
  verified: boolean;
}

export interface SummaryResponse {
  summary: string;
  category: string;
  readingTime: number; // in minutes
}

export interface ApiError {
  message: string;
  code?: string;
}

export type TrustLevel = "high" | "medium" | "low";

export interface FactCheckResult {
  score: number;
  level: TrustLevel;
  reason: string;
  sources: string[];
}

