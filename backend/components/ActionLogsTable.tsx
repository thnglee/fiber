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
        <div className="bg-white shadow-md rounded-lg overflow-hidden">
            <div className="px-4 py-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Action Logs</h2>
                <p className="text-sm text-gray-500 mt-1">{total} total actions</p>
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full leading-normal">
                    <thead>
                        <tr>
                            <th className="px-4 py-3 border-b-2 border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                Time
                            </th>
                            <th className="px-4 py-3 border-b-2 border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                Type
                            </th>
                            <th className="px-4 py-3 border-b-2 border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                Website
                            </th>
                            <th className="px-4 py-3 border-b-2 border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                Category
                            </th>
                            <th className="px-4 py-3 border-b-2 border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                Output
                            </th>
                            <th className="px-4 py-3 border-b-2 border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                Tokens
                            </th>
                            <th className="px-4 py-3 border-b-2 border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                Processing
                            </th>
                            <th className="px-4 py-3 border-b-2 border-gray-200 bg-gray-50"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {actions.map((action) => {
                            const isExpanded = expandedId === action.id
                            const isNew = newAction?.id === action.id

                            return (
                                <>
                                    <tr
                                        key={action.id}
                                        className={`transition-colors ${isNew ? 'bg-blue-50 animate-pulse' : 'hover:bg-blue-50/50 bg-white'}`}
                                    >
                                        <td className="px-4 py-4 bg-transparent text-sm text-gray-700 whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                <Clock className="w-4 h-4 text-gray-400" />
                                                {format(new Date(action.created_at), 'MMM d, HH:mm')}
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 bg-transparent text-sm">
                                            <span
                                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getActionTypeBadge(
                                                    action.action_type
                                                )}`}
                                            >
                                                {action.action_type}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 bg-transparent text-sm text-gray-700">
                                            <div className="flex items-center gap-2">
                                                <Globe className="w-4 h-4 text-gray-400" />
                                                {action.website}
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 bg-transparent text-sm">
                                            {action.category ? (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
                                                    {action.category}
                                                </span>
                                            ) : (
                                                <span className="text-gray-400">N/A</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-4 bg-transparent text-sm max-w-xs">
                                            <div className="font-mono text-xs text-gray-600 truncate" title={
                                                typeof action.output_content === 'string'
                                                    ? action.output_content
                                                    : action.output_content?.summary || action.output_content?.reason || JSON.stringify(action.output_content)
                                            }>
                                                {(() => {
                                                    if (typeof action.output_content === 'string') {
                                                        return truncate(action.output_content, 50)
                                                    }
                                                    if (action.output_content?.summary) {
                                                        return truncate(action.output_content.summary, 50)
                                                    }
                                                    if (action.output_content?.reason) {
                                                        return truncate(action.output_content.reason, 50)
                                                    }
                                                    return truncate(JSON.stringify(action.output_content), 50)
                                                })()}
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 bg-transparent text-sm">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-700">
                                                <Zap className="w-3 h-3 text-yellow-500 mr-1" />
                                                {action.token_usage.total_tokens.toLocaleString()}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 bg-transparent text-sm text-gray-600 whitespace-nowrap">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-700">
                                                {action.processing_time_ms}ms
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 bg-transparent text-sm text-right">
                                            <button
                                                onClick={() => setExpandedId(isExpanded ? null : action.id)}
                                                className="text-gray-400 hover:text-gray-700 transition-colors"
                                            >
                                                {isExpanded ? (
                                                    <ChevronUp className="w-5 h-5" />
                                                ) : (
                                                    <ChevronDown className="w-5 h-5" />
                                                )}
                                            </button>
                                        </td>
                                    </tr>
                                    {isExpanded && (
                                        <tr key={`${action.id}-expanded`} className="bg-gray-50">
                                            <td colSpan={8} className="px-4 py-4 border-t border-gray-100">
                                                <div className="space-y-4">
                                                    <h4 className="font-semibold text-gray-900 text-base">Full Action Details</h4>

                                                    {/* Metadata Row - Location, Input Type, Token Usage, User Agent */}
                                                    <div className="grid grid-cols-4 gap-4">
                                                        {/* Location Info */}
                                                        <div className="bg-white rounded-lg p-4 border border-gray-200">
                                                            <div className="flex items-center gap-1.5 mb-2">
                                                                <MapPin className="w-4 h-4 text-gray-400" />
                                                                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Location</span>
                                                            </div>
                                                            {action.user_location ? (
                                                                <div className="mt-1">
                                                                    <div className="font-semibold text-gray-900 text-base">{getCountryFlag(action.user_location.country_code)} {action.user_location.city}</div>
                                                                    <div className="text-gray-600 text-sm mt-0.5">{action.user_location.country}</div>
                                                                </div>
                                                            ) : (
                                                                <div className="font-semibold text-gray-900 text-base mt-1">Unknown</div>
                                                            )}
                                                        </div>

                                                        {/* Input Type */}
                                                        <div className="bg-white rounded-lg p-4 border border-gray-200">
                                                            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Input Type</div>
                                                            <div className="font-semibold text-gray-900 text-base capitalize mt-1">{action.input_type}</div>
                                                        </div>

                                                        {/* Token Usage */}
                                                        <div className="bg-white rounded-lg p-4 border border-gray-200">
                                                            <div className="flex items-center gap-1.5 mb-2">
                                                                <Zap className="w-4 h-4 text-yellow-500" />
                                                                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Tokens</span>
                                                            </div>
                                                            <div className="text-sm space-y-1 mt-1">
                                                                <div className="flex justify-between items-center text-gray-600">
                                                                    <span>In:</span>
                                                                    <span className="font-semibold text-gray-900">{action.token_usage.prompt_tokens.toLocaleString()}</span>
                                                                </div>
                                                                <div className="flex justify-between items-center text-gray-600">
                                                                    <span>Out:</span>
                                                                    <span className="font-semibold text-gray-900">{action.token_usage.completion_tokens.toLocaleString()}</span>
                                                                </div>
                                                                <div className="flex justify-between items-center border-t border-gray-200 pt-1 mt-1">
                                                                    <span className="text-gray-900 font-semibold">Total:</span>
                                                                    <span className="font-bold text-yellow-600">{action.token_usage.total_tokens.toLocaleString()}</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* User Agent */}
                                                        <div className="bg-white rounded-lg p-4 border border-gray-200">
                                                            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">User Agent</div>
                                                            <div className="font-semibold text-gray-900 text-base truncate mt-1" title={action.user_agent || 'Unknown'}>
                                                                {action.user_agent ? action.user_agent.split(' ')[0] : 'Unknown'}
                                                            </div>
                                                            <div className="text-sm text-gray-600 mt-1">
                                                                IP: {action.user_ip || 'Unknown'}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Input and Output Content */}
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        {/* Input Content */}
                                                        <div className="bg-white rounded-lg p-4 border border-gray-200">
                                                            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Input Content</div>
                                                            <div className="bg-gray-50 p-3 rounded border border-gray-200 max-h-80 overflow-y-auto">
                                                                {action.input_content && action.input_content.trim() ? (
                                                                    <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-gray-900">
                                                                        {action.input_content}
                                                                    </pre>
                                                                ) : (
                                                                    <div className="text-gray-400 italic text-sm">No input content available</div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Output Content */}
                                                        <div className="bg-white rounded-lg p-4 border border-gray-200">
                                                            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Output Content</div>
                                                            <div className="bg-gray-50 p-3 rounded border border-gray-200 max-h-80 overflow-y-auto">
                                                                {action.action_type === 'summarize' && typeof action.output_content === 'object' && action.output_content?.summary ? (
                                                                    <div className="space-y-3 text-gray-900">
                                                                        <div>
                                                                            <div className="font-semibold text-blue-600 text-sm mb-2">Summary:</div>
                                                                            <p className="leading-relaxed text-sm">{action.output_content.summary}</p>
                                                                        </div>
                                                                        {action.output_content.category && (
                                                                            <div className="flex items-baseline gap-2">
                                                                                <span className="font-semibold text-purple-600 text-sm">Category:</span>
                                                                                <span className="text-sm">{action.output_content.category}</span>
                                                                            </div>
                                                                        )}
                                                                        {action.output_content.readingTime && (
                                                                            <div className="flex items-baseline gap-2">
                                                                                <span className="font-semibold text-green-600 text-sm">Reading Time:</span>
                                                                                <span className="text-sm">{action.output_content.readingTime} min</span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ) : action.action_type === 'fact-check' && typeof action.output_content === 'object' && action.output_content ? (
                                                                    <div className="space-y-3 text-gray-900">
                                                                        {action.output_content.score !== undefined && action.output_content.score !== null ? (
                                                                            <div className="flex items-baseline gap-2">
                                                                                <span className="font-semibold text-yellow-600 text-sm">Score:</span>
                                                                                <span className="text-lg font-bold">{action.output_content.score}/100</span>
                                                                            </div>
                                                                        ) : null}
                                                                        {action.output_content.reason ? (
                                                                            <div>
                                                                                <div className="font-semibold text-blue-600 text-sm mb-2">Reason:</div>
                                                                                <p className="leading-relaxed text-sm">{action.output_content.reason}</p>
                                                                            </div>
                                                                        ) : null}
                                                                        {action.output_content.sources && action.output_content.sources.length > 0 ? (
                                                                            <div>
                                                                                <div className="font-semibold text-green-600 text-sm mb-2">Sources:</div>
                                                                                <ul className="list-disc list-inside ml-2 space-y-1.5">
                                                                                    {action.output_content.sources.map((source: string, idx: number) => (
                                                                                        <li key={idx} className="text-sm break-all">
                                                                                            <a href={source} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 hover:underline">
                                                                                                {source}
                                                                                            </a>
                                                                                        </li>
                                                                                    ))}
                                                                                </ul>
                                                                            </div>
                                                                        ) : null}
                                                                        {!action.output_content.score && !action.output_content.reason && (!action.output_content.sources || action.output_content.sources.length === 0) && (
                                                                            <div className="text-gray-400 italic text-sm">No fact-check details available</div>
                                                                        )}
                                                                    </div>
                                                                ) : action.output_content && (typeof action.output_content === 'string' || Object.keys(action.output_content).length > 0) ? (
                                                                    <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-gray-900">
                                                                        {typeof action.output_content === 'string'
                                                                            ? action.output_content
                                                                            : JSON.stringify(action.output_content, null, 2)}
                                                                    </pre>
                                                                ) : (
                                                                    <div className="text-gray-400 italic text-sm">No output content available</div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {loading && actions.length === 0 && (
                <div className="bg-white p-8 text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <p className="mt-4 text-gray-600">Loading actions...</p>
                </div>
            )}

            {!loading && actions.length === 0 && (
                <div className="px-4 py-8 bg-white text-sm text-center text-gray-500">
                    No actions found. Start using the extension to see data here.
                </div>
            )}
        </div>
    )
}
