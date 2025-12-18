'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { createClient } from '@supabase/supabase-js'
import type { UserAction } from '../../shared/types'

interface RealtimeContextType {
    newAction: UserAction | null
    isConnected: boolean
}

const RealtimeContext = createContext<RealtimeContextType>({
    newAction: null,
    isConnected: false,
})

export function useRealtime() {
    return useContext(RealtimeContext)
}

interface RealtimeProviderProps {
    children: ReactNode
    supabaseUrl: string
    supabaseAnonKey: string
}

export function RealtimeProvider({ children, supabaseUrl, supabaseAnonKey }: RealtimeProviderProps) {
    const [newAction, setNewAction] = useState<UserAction | null>(null)
    const [isConnected, setIsConnected] = useState(false)

    useEffect(() => {
        // Create Supabase client
        const supabase = createClient(supabaseUrl, supabaseAnonKey)

        // Subscribe to user_actions table changes
        const channel = supabase
            .channel('user_actions_changes')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'user_actions',
                },
                (payload) => {
                    console.log('[Realtime] New action received:', payload.new)
                    setNewAction(payload.new as UserAction)

                    // Clear after 5 seconds to allow components to react
                    setTimeout(() => setNewAction(null), 5000)
                }
            )
            .subscribe((status) => {
                console.log('[Realtime] Subscription status:', status)
                setIsConnected(status === 'SUBSCRIBED')
            })

        // Cleanup on unmount
        return () => {
            console.log('[Realtime] Unsubscribing from channel')
            supabase.removeChannel(channel)
        }
    }, [supabaseUrl, supabaseAnonKey])

    return (
        <RealtimeContext.Provider value={{ newAction, isConnected }}>
            {children}
        </RealtimeContext.Provider>
    )
}
