import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getCorsHeaders } from '@/middleware/cors'

/**
 * GET /api/actions
 * Fetch paginated action logs with optional filtering
 * 
 * Query params:
 * - limit: number of results (default: 50, max: 100)
 * - offset: pagination offset (default: 0)
 * - action_type: filter by 'summarize' or 'fact-check'
 * - website: filter by website
 * - start_date: filter by start date (ISO string)
 * - end_date: filter by end date (ISO string)
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)

        // Parse query parameters
        const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
        const offset = parseInt(searchParams.get('offset') || '0')
        const actionType = searchParams.get('action_type')
        const website = searchParams.get('website')
        const startDate = searchParams.get('start_date')
        const endDate = searchParams.get('end_date')

        const supabase = getSupabaseAdmin()
        let query = supabase
            .from('user_actions')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1)

        // Apply filters
        if (actionType) {
            query = query.eq('action_type', actionType)
        }

        if (website) {
            query = query.eq('website', website)
        }

        if (startDate) {
            query = query.gte('created_at', startDate)
        }

        if (endDate) {
            query = query.lte('created_at', endDate)
        }

        console.log('[Actions API] Executing query...')
        const { data, error, count } = await query

        console.log('[Actions API] Query result:', {
            dataLength: data?.length,
            count,
            error: error?.message,
            hasData: !!data
        })

        if (error) {
            console.error('[Actions API] Error fetching actions:', error)
            return NextResponse.json(
                { error: 'Failed to fetch actions' },
                { status: 500, headers: getCorsHeaders() }
            )
        }

        // Parse JSONB fields to ensure they are proper objects, not strings
        const parsedActions = (data || []).map(action => {
            const parseJsonField = (field: unknown) => {
                if (typeof field === 'string') {
                    try {
                        return JSON.parse(field)
                    } catch (e) {
                        console.warn('[Actions API] Failed to parse JSON field:', e)
                        return field
                    }
                }
                return field
            }

            return {
                ...action,
                token_usage: parseJsonField(action.token_usage),
                output_content: parseJsonField(action.output_content),
                user_location: parseJsonField(action.user_location)
            }
        })

        return NextResponse.json(
            {
                actions: parsedActions,
                total: count || 0,
                limit,
                offset
            },
            { headers: getCorsHeaders() }
        )
    } catch (error) {
        console.error('[Actions API] Unexpected error:', error)
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
