import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getCorsHeaders } from '@/middleware/cors'
import type { ActionStats } from '@shared/types'

// Type-safe interface for token usage
interface TokenUsage {
    total_tokens?: number
    prompt_tokens?: number
    completion_tokens?: number
}

/**
 * GET /api/actions/stats
 * Fetch aggregated statistics for the admin dashboard
 * 
 * Returns:
 * - total_actions: total number of actions
 * - total_tokens: sum of all token usage
 * - avg_processing_time: average processing time in ms
 * - actions_by_type: breakdown by action type
 * - actions_by_website: breakdown by website
 * - actions_today: count of actions in the last 24 hours
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = getSupabaseAdmin()

        // Fetch all actions (we'll aggregate in memory for simplicity)
        // For production with large datasets, consider using Supabase functions or views
        const { data: actions, error } = await supabase
            .from('user_actions')
            .select('action_type, website, token_usage, processing_time_ms, created_at')

        if (error) {
            console.error('[Stats API] Error fetching actions:', error)
            return NextResponse.json(
                { error: 'Failed to fetch statistics' },
                { status: 500, headers: getCorsHeaders() }
            )
        }

        if (!actions || actions.length === 0) {
            // Return empty stats
            const emptyStats: ActionStats = {
                total_actions: 0,
                total_tokens: 0,
                avg_processing_time: 0,
                actions_by_type: {},
                actions_by_website: {},
                actions_today: 0
            }

            return NextResponse.json(emptyStats, { headers: getCorsHeaders() })
        }

        // Calculate statistics
        const now = new Date()
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

        let totalTokens = 0
        let totalProcessingTime = 0
        const actionsByType: Record<string, number> = {}
        const actionsByWebsite: Record<string, number> = {}
        let actionsToday = 0

        actions.forEach(action => {
            // Parse token_usage if it's a string
            let tokenUsage = action.token_usage
            if (typeof tokenUsage === 'string') {
                try {
                    tokenUsage = JSON.parse(tokenUsage)
                } catch (e) {
                    console.warn('[Stats API] Failed to parse token_usage:', e)
                    tokenUsage = null
                }
            }

            // Sum tokens with type-safe approach
            if (tokenUsage && typeof tokenUsage === 'object') {
                const usage = tokenUsage as TokenUsage
                totalTokens += usage.total_tokens ?? 0
            }

            // Sum processing time
            totalProcessingTime += action.processing_time_ms || 0

            // Count by type
            actionsByType[action.action_type] = (actionsByType[action.action_type] || 0) + 1

            // Count by website
            actionsByWebsite[action.website] = (actionsByWebsite[action.website] || 0) + 1

            // Count today's actions
            const actionDate = new Date(action.created_at)
            if (actionDate >= oneDayAgo) {
                actionsToday++
            }
        })

        const stats: ActionStats = {
            total_actions: actions.length,
            total_tokens: totalTokens,
            avg_processing_time: actions.length > 0
                ? Math.round(totalProcessingTime / actions.length)
                : 0,
            actions_by_type: actionsByType,
            actions_by_website: actionsByWebsite,
            actions_today: actionsToday
        }

        return NextResponse.json(stats, { headers: getCorsHeaders() })
    } catch (error) {
        console.error('[Stats API] Unexpected error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500, headers: getCorsHeaders() }
        )
    }
}

// Handle CORS preflight
export async function OPTIONS() {
    return new NextResponse(null, {
        status: 200,
        headers: getCorsHeaders(),
    })
}
