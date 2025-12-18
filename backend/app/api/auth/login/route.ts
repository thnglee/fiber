import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getEnvVar } from '@/config/env'
import { getCorsHeaders } from '@/middleware/cors'

/**
 * POST /api/auth/login
 * Authenticate admin user with Supabase Auth
 */
export async function POST(request: NextRequest) {
    try {
        const { email, password } = await request.json()

        if (!email || !password) {
            return NextResponse.json(
                { error: 'Email and password are required' },
                { status: 400, headers: getCorsHeaders() }
            )
        }

        // Create Supabase client
        const supabaseUrl = getEnvVar('SUPABASE_URL')
        const supabaseAnonKey = getEnvVar('SUPABASE_ANON_KEY')
        const supabaseServiceKey = getEnvVar('SUPABASE_SERVICE_ROLE_KEY')

        if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
            return NextResponse.json(
                { error: 'Supabase not configured' },
                { status: 500, headers: getCorsHeaders() }
            )
        }

        const supabase = createClient(supabaseUrl, supabaseAnonKey)

        // Sign in with Supabase Auth
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        })

        if (error || !data.session) {
            return NextResponse.json(
                { error: 'Invalid email or password' },
                { status: 401, headers: getCorsHeaders() }
            )
        }

        // Check if user is an admin using service role (bypasses RLS)
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
        const { data: adminUser, error: adminError } = await supabaseAdmin
            .from('admin_users')
            .select('id')
            .eq('id', data.user.id)
            .single()

        if (adminError || !adminUser) {
            return NextResponse.json(
                { error: 'Access denied. Not an admin user.' },
                { status: 403, headers: getCorsHeaders() }
            )
        }

        // Return session token
        return NextResponse.json(
            {
                access_token: data.session.access_token,
                user: {
                    id: data.user.id,
                    email: data.user.email,
                },
            },
            { headers: getCorsHeaders() }
        )
    } catch (error) {
        console.error('[Auth] Login error:', error)
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
