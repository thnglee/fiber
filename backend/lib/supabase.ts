import { createClient } from '@supabase/supabase-js'
import { getEnvVar } from '@/config/env'

/**
 * Server-side Supabase client with service role key
 * Use this for admin operations and bypassing RLS
 */
export function getSupabaseAdmin() {
    const supabaseUrl = getEnvVar('SUPABASE_URL')
    const supabaseServiceKey = getEnvVar('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
    }

    return createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        },
        db: {
            schema: 'public'
        }
    })
}

/**
 * Browser-side Supabase client with anon key
 * Use this for client-side operations with RLS
 */
export function getSupabaseBrowser() {
    const supabaseUrl = getEnvVar('SUPABASE_URL')
    const supabaseAnonKey = getEnvVar('SUPABASE_ANON_KEY')

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set')
    }

    return createClient(supabaseUrl, supabaseAnonKey)
}
