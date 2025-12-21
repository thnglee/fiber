import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getEnvVar } from '@/config/env'

/**
 * Check if user is authenticated admin
 * Returns user ID if authenticated, null otherwise
 */
export async function checkAdminAuth(request: NextRequest): Promise<string | null> {
    // Check for dev mode bypass
    const devMode = getEnvVar('ADMIN_DEV_MODE') === 'true'
    if (devMode) {
        console.log('[Auth] Dev mode enabled - bypassing authentication')
        return 'dev-mode-user'
    }

    try {
        // Get session token from cookie
        const token = request.cookies.get('sb-access-token')?.value

        if (!token) {
            return null
        }

        // Verify token with Supabase
        const supabase = getSupabaseAdmin()
        const { data: { user }, error } = await supabase.auth.getUser(token)

        if (error || !user) {
            return null
        }

        // Check if user is in admin_users table
        const { data: adminUser, error: adminError } = await supabase
            .from('admin_users')
            .select('id')
            .eq('id', user.id)
            .single()

        if (adminError || !adminUser) {
            console.log('[Auth] User not found in admin_users table:', user.email)
            return null
        }

        // Update last_login
        await supabase
            .from('admin_users')
            .update({ last_login: new Date().toISOString() })
            .eq('id', user.id)

        return user.id
    } catch (error) {
        console.error('[Auth] Error checking admin auth:', error)
        return null
    }
}

/**
 * Middleware to protect admin routes
 * Redirects to /admin/login if not authenticated
 */
export async function requireAdminAuth(request: NextRequest): Promise<NextResponse | null> {
    const userId = await checkAdminAuth(request)

    if (!userId) {
        // Redirect to login
        const loginUrl = new URL('/admin/login', request.url)
        loginUrl.searchParams.set('redirect', request.nextUrl.pathname)
        return NextResponse.redirect(loginUrl)
    }

    // User is authenticated, allow request to proceed
    return null
}
