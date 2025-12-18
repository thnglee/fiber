'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { ChevronDown, ChevronUp, MapPin, Globe, Clock, Zap } from 'lucide-react'
import type { UserAction } from '../../shared/types'
import { useRealtime } from './RealtimeProvider'

interface ActionLogsTableProps {
    initialActions: UserAction[]
    total: number
    loading?: boolean
}

export function ActionLogsTable({ initialActions, total, loading = false }: ActionLogsTableProps) {
    const [actions, setActions] = useState<UserAction[]>(initialActions)
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const { newAction } = useRealtime()

    // Update actions when initialActions changes
    useEffect(() => {
        setActions(initialActions)
    }, [initialActions])

    // Add new action to the top when received via Realtime
    useEffect(() => {
        if (newAction) {
            setActions((prev) => [newAction, ...prev])
        }
    }, [newAction])

    const getActionTypeBadge = (type: string) => {
        const colors = {
            summarize: 'bg-blue-50 text-blue-700 border-blue-200',
            'fact-check': 'bg-green-50 text-green-700 border-green-200',
        }
        return colors[type as keyof typeof colors] || 'bg-gray-50 text-gray-700 border-gray-200'
    }

    const getCountryFlag = (countryCode: string) => {
        if (!countryCode) return '🌍'
        const codePoints = countryCode
            .toUpperCase()
            .split('')
            .map((char) => 127397 + char.charCodeAt(0))
        return String.fromCodePoint(...codePoints)
    }

    const truncate = (text: string, maxLength: number) => {
        if (text.length <= maxLength) return text
        return text.substring(0, maxLength) + '...'
    }

    return (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Action Logs</h2>
                <p className="text-sm text-gray-500 mt-1">{total} total actions</p>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Time
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Type
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Website
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Location
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Input
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Tokens
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Time
                            </th>
                            <th className="px-6 py-3"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {actions.map((action) => {
                            const isExpanded = expandedId === action.id
                            const isNew = newAction?.id === action.id

                            return (
                                <tr
                                    key={action.id}
                                    className={`hover:bg-gray-50 transition-colors ${isNew ? 'bg-blue-50 animate-pulse' : ''
                                        }`}
                                >
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        <div className="flex items-center gap-2">
                                            <Clock className="w-4 h-4 text-gray-400" />
                                            {format(new Date(action.created_at), 'MMM d, HH:mm')}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span
                                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getActionTypeBadge(
                                                action.action_type
                                            )}`}
                                        >
                                            {action.action_type}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        <div className="flex items-center gap-2">
                                            <Globe className="w-4 h-4 text-gray-400" />
                                            {action.website}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {action.user_location ? (
                                            <div className="flex items-center gap-2">
                                                <MapPin className="w-4 h-4 text-gray-400" />
                                                <span>
                                                    {getCountryFlag(action.user_location.country_code)}{' '}
                                                    {action.user_location.city}, {action.user_location.country}
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="text-gray-400">Unknown</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs">
                                        <div className="font-mono text-xs">
                                            {truncate(action.input_content, 50)}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        <div className="flex items-center gap-2">
                                            <Zap className="w-4 h-4 text-yellow-500" />
                                            {action.token_usage.total_tokens.toLocaleString()}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {action.processing_time_ms}ms
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                        <button
                                            onClick={() => setExpandedId(isExpanded ? null : action.id)}
                                            className="text-gray-400 hover:text-gray-600"
                                        >
                                            {isExpanded ? (
                                                <ChevronUp className="w-5 h-5" />
                                            ) : (
                                                <ChevronDown className="w-5 h-5" />
                                            )}
                                        </button>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {loading && actions.length === 0 && (
                <div className="px-6 py-12 text-center">
                    <div className="animate-pulse space-y-3">
                        <div className="h-4 bg-gray-200 rounded w-1/4 mx-auto"></div>
                        <div className="h-4 bg-gray-200 rounded w-1/3 mx-auto"></div>
                    </div>
                    <p className="text-sm text-gray-500 mt-4">Loading actions...</p>
                </div>
            )}

            {!loading && actions.length === 0 && (
                <div className="px-6 py-12 text-center text-gray-500">
                    <p className="text-base font-medium text-gray-900 mb-2">No actions found</p>
                    <p className="text-sm">Start using the extension to see data here, or try adjusting your filters.</p>
                </div>
            )}
        </div>
    )
}
