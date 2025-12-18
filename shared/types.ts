/**
 * Shared types used by both extension and backend
 * 
 * This file contains common API response types and domain types
 * to ensure consistency across the extension and backend.
 */

/**
 * Fact check API response
 */
export interface FactCheckResponse {
    score: number; // 0-100 trust score
    reason: string;
    sources: string[];
    verified: boolean;
}

/**
 * Summary API response
 */
export interface SummaryResponse {
    summary: string;
    category: string;
    readingTime: number; // in minutes
}

/**
 * Standard API error response
 */
export interface ApiError {
    message: string;
    code?: string;
}

/**
 * Trust level classification based on fact-check score
 */
export type TrustLevel = "high" | "medium" | "low";

/**
 * Fact check result with trust level classification
 */
export interface FactCheckResult {
    score: number;
    level: TrustLevel;
    reason: string;
    sources: string[];
}
