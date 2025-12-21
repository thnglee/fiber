import { getSupabaseAdmin } from '@/lib/supabase'
import type { TokenUsage, LocationData } from '../../shared/types'

/**
 * Parameters for tracking a user action
 */
interface TrackActionParams {
    actionType: 'summarize' | 'fact-check'
    inputType: 'text' | 'url'
    inputContent: string
    outputContent: any
    category?: string | null
    tokenUsage?: TokenUsage
    userIp: string
    website: string
    userAgent: string
    processingTimeMs: number
}

/**
 * Geolocation response from ipapi.co
 */
interface GeolocationResponse {
    city?: string
    region?: string
    country?: string
    country_code?: string
    latitude?: number
    longitude?: number
    error?: boolean
}

/**
 * Track a user action to Supabase
 * This function is fire-and-forget - errors are logged but don't throw
 */
export async function trackAction(params: TrackActionParams): Promise<void> {
    try {
        // Get location data from IP
        const location = await getLocationFromIP(params.userIp)

        // Insert into Supabase
        const supabase = getSupabaseAdmin()
        const { error } = await supabase
            .from('user_actions')
            .insert({
                action_type: params.actionType,
                input_type: params.inputType,
                input_content: params.inputContent,
                output_content: params.outputContent,
                category: params.category || null,
                token_usage: params.tokenUsage || null,
                user_ip: params.userIp,
                user_location: location,
                website: params.website,
                user_agent: params.userAgent,
                processing_time_ms: params.processingTimeMs
            })

        if (error) {
            console.error('[Action Tracking] Failed to insert action:', error)
        }
    } catch (error) {
        // Log error but don't throw - tracking should never break the main flow
        console.error('[Action Tracking] Error tracking action:', error)
    }
}

/**
 * Get location data from IP address using ipapi.co
 * Free tier: 1,000 requests/day
 * Gracefully degrades to null if API fails or rate limit exceeded
 */
async function getLocationFromIP(ip: string): Promise<LocationData | null> {
    try {
        // Skip localhost IPs
        if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
            return null
        }

        const response = await fetch(`https://ipapi.co/${ip}/json/`, {
            headers: {
                'User-Agent': 'Fiber-Analytics/1.0'
            }
        })

        if (!response.ok) {
            console.warn(`[Action Tracking] Geolocation API returned ${response.status}`)
            return null
        }

        const data: GeolocationResponse = await response.json()

        // Check if API returned an error (rate limit, etc.)
        if (data.error) {
            console.warn('[Action Tracking] Geolocation API error or rate limit')
            return null
        }

        // Return structured location data
        if (data.city && data.country) {
            return {
                city: data.city,
                region: data.region || '',
                country: data.country,
                country_code: data.country_code || '',
                lat: data.latitude || 0,
                lon: data.longitude || 0
            }
        }

        return null
    } catch (error) {
        console.warn('[Action Tracking] Failed to fetch location:', error)
        return null
    }
}

/**
 * Extract token usage from OpenAI API response or debug info
 * Supports both direct usage object and nested debug structure
 * Returns default values if usage data is not available
 */
export function extractTokenUsage(responseOrDebugInfo: any): TokenUsage {
    // Try to extract usage from the response/debug info
    const usage = responseOrDebugInfo?.usage

    if (usage && typeof usage === 'object') {
        // Check if at least one token count is present and non-zero
        const hasValidUsage = usage.total_tokens > 0 ||
            usage.prompt_tokens > 0 ||
            usage.completion_tokens > 0

        if (hasValidUsage) {
            return {
                prompt_tokens: usage.prompt_tokens || 0,
                completion_tokens: usage.completion_tokens || 0,
                total_tokens: usage.total_tokens || 0
            }
        }
    }

    // Default fallback when no usage data is available
    return {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
    }
}

/**
 * Get client IP address from Next.js request headers
 */
export function getClientIP(headers: Headers): string {
    // Try various headers in order of preference
    const forwardedFor = headers.get('x-forwarded-for')
    if (forwardedFor) {
        return forwardedFor.split(',')[0].trim()
    }

    const realIp = headers.get('x-real-ip')
    if (realIp) {
        return realIp
    }

    // Fallback to localhost
    return '127.0.0.1'
}
