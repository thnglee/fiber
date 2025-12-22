/**
 * CORS headers configuration for API routes
 * 
 * This middleware provides consistent CORS headers across all API endpoints
 * to allow cross-origin requests from browser extensions.
 * 
 * Security: In production, only whitelisted origins are allowed.
 * In development, all origins are allowed for easier testing.
 */

export interface CorsHeaders {
  "Access-Control-Allow-Origin": string
  "Access-Control-Allow-Methods": string
  "Access-Control-Allow-Headers": string
  "Access-Control-Max-Age": string
}

/**
 * Get allowed origins based on environment
 * 
 * ⚠️ TEMPORARY FOR UNI PROJECT: Allow all origins (*)
 * TODO: Restrict to specific origins before production deployment
 */
function getAllowedOrigins(): string[] {
  // TEMPORARY: Allow all origins for university project demo
  // This allows the extension to work from any webpage (e.g., vnexpress.net)
  console.warn('[CORS] ⚠️ WARNING: Allowing all origins (*) - INSECURE for production!')
  return ['*']

  /* ORIGINAL PRODUCTION CODE - RESTORE BEFORE DEPLOYMENT:
  const isDevelopment = process.env.NODE_ENV !== 'production'

  if (isDevelopment) {
    return ['*']
  }

  const allowedOrigins: string[] = []

  const chromeExtensionId = process.env.CHROME_EXTENSION_ID
  if (chromeExtensionId) {
    allowedOrigins.push(`chrome-extension://${chromeExtensionId}`)
  }

  const firefoxExtensionId = process.env.FIREFOX_EXTENSION_ID
  if (firefoxExtensionId) {
    allowedOrigins.push(`moz-extension://${firefoxExtensionId}`)
  }

  if (process.env.ALLOW_LOCALHOST === 'true') {
    allowedOrigins.push('http://localhost:3000')
    allowedOrigins.push('http://localhost:3001')
  }

  if (allowedOrigins.length === 0) {
    console.warn('[CORS] WARNING: No extension IDs configured in production! Falling back to wildcard (INSECURE)')
    return ['*']
  }

  return allowedOrigins
  */
}

/**
 * Get CORS headers for API responses
 * 
 * @param requestOrigin - Optional origin from the request to validate
 * @returns Object containing CORS headers compatible with HeadersInit
 */
export function getCorsHeaders(requestOrigin?: string): Record<string, string> {
  const allowedOrigins = getAllowedOrigins()

  // If wildcard is allowed, use it
  if (allowedOrigins.includes('*')) {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
      "Access-Control-Max-Age": "86400",
    }
  }

  // Otherwise, check if the request origin is in the whitelist
  let allowedOrigin = allowedOrigins[0] // Default to first allowed origin

  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    allowedOrigin = requestOrigin
  }

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Allow-Credentials": "true", // Required for cookies/auth
  }
}

