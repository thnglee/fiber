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
 * Development: Allow all origins (*)
 * Production: Only allow specific extension IDs and localhost for testing
 */
function getAllowedOrigins(): string[] {
  const isDevelopment = process.env.NODE_ENV !== 'production'

  if (isDevelopment) {
    // In development, allow all origins for easier testing
    return ['*']
  }

  // Production: Whitelist specific origins
  const allowedOrigins: string[] = []

  // Chrome Extension ID (get this from chrome://extensions after building)
  // Format: chrome-extension://YOUR_EXTENSION_ID_HERE
  const chromeExtensionId = process.env.CHROME_EXTENSION_ID
  if (chromeExtensionId) {
    allowedOrigins.push(`chrome-extension://${chromeExtensionId}`)
  }

  // Firefox Extension ID (if supporting Firefox)
  // Format: moz-extension://YOUR_EXTENSION_ID_HERE
  const firefoxExtensionId = process.env.FIREFOX_EXTENSION_ID
  if (firefoxExtensionId) {
    allowedOrigins.push(`moz-extension://${firefoxExtensionId}`)
  }

  // Allow localhost for local testing (optional, remove in strict production)
  if (process.env.ALLOW_LOCALHOST === 'true') {
    allowedOrigins.push('http://localhost:3000')
    allowedOrigins.push('http://localhost:3001')
  }

  // Fallback: if no extension IDs are set in production, log warning
  if (allowedOrigins.length === 0) {
    console.warn('[CORS] WARNING: No extension IDs configured in production! Falling back to wildcard (INSECURE)')
    return ['*']
  }

  return allowedOrigins
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

