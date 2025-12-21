import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getEnvVar } from '@/config/env'

/**
 * Next.js middleware for route protection
 * Runs on every request to check authentication
 */
export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl

    // Public routes - no auth required
    const publicRoutes = [
        '/admin/login',
        '/api/summarize',
        '/api/fact-check',
    ]

    // Check if route is public
    if (publicRoutes.some(route => pathname.startsWith(route))) {
        return NextResponse.next()
    }

    // Protected routes - require auth
    const protectedRoutes = [
        '/',
        '/api/actions',
    ]

    // Check if route needs protection
    const needsAuth = protectedRoutes.some(route =>
        pathname === route || pathname.startsWith(route + '/')
    )

    if (needsAuth) {
        // Check dev mode
        const devMode = getEnvVar('ADMIN_DEV_MODE') === 'true'
        if (devMode) {
            console.log('[Middleware] Dev mode enabled - bypassing auth for:', pathname)
            return NextResponse.next()
        }

        // Check for auth token
        const token = request.cookies.get('sb-access-token')?.value

        if (!token) {
            // For API routes, return 401 instead of redirecting
            if (pathname.startsWith('/api/')) {
                return NextResponse.json(
                    { error: 'Unauthorized' },
                    { status: 401 }
                )
            }

            // For page routes, redirect to login
            const loginUrl = new URL('/admin/login', request.url)
            loginUrl.searchParams.set('redirect', pathname)
            return NextResponse.redirect(loginUrl)
        }
    }

    return NextResponse.next()
}

// Configure which routes this middleware runs on
export const config = {
    matcher: [
        '/',
        '/api/actions/:path*',
        '/admin/:path*',
    ],
}
