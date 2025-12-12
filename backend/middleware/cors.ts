/**
 * CORS headers configuration for API routes
 * 
 * This middleware provides consistent CORS headers across all API endpoints
 * to allow cross-origin requests from browser extensions.
 */

export interface CorsHeaders {
  "Access-Control-Allow-Origin": string
  "Access-Control-Allow-Methods": string
  "Access-Control-Allow-Headers": string
  "Access-Control-Max-Age": string
}

/**
 * Get CORS headers for API responses
 * 
 * @returns Object containing CORS headers compatible with HeadersInit
 */
export function getCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Max-Age": "86400",
  }
}
