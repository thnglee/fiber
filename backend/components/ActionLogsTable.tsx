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
                                Category
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Output
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Tokens
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Processing
                            </th>
                            <th className="px-6 py-3"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {actions.map((action) => {
                            const isExpanded = expandedId === action.id
                            const isNew = newAction?.id === action.id

                            return (
                                <>
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
                                            {action.category ? (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
                                                    {action.category}
                                                </span>
                                            ) : (
                                                <span className="text-gray-400">N/A</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-900 max-w-xs">
                                            <div className="font-mono text-xs">
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
                                                className="text-gray-400 hover:text-gray-600 transition-colors"
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
                                        <tr key={`${action.id}-expanded`} className="bg-slate-800">
                                            <td colSpan={8} className="px-8 py-8">
                                                <div className="space-y-6">
                                                    <h4 className="font-semibold text-white text-base mb-2">Full Action Details</h4>

                                                    {/* Metadata Row - Location, Input Type, Token Usage, User Agent */}
                                                    <div className="grid grid-cols-4 gap-4">
                                                        {/* Location Info */}
                                                        <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                                                            <div className="flex items-center gap-1.5 mb-2">
                                                                <MapPin className="w-4 h-4 text-gray-300" />
                                                                <span className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Location</span>
                                                            </div>
                                                            {action.user_location ? (
                                                                <div className="mt-1">
                                                                    <div className="font-semibold text-gray-100 text-base">{getCountryFlag(action.user_location.country_code)} {action.user_location.city}</div>
                                                                    <div className="text-gray-300 text-sm mt-0.5">{action.user_location.country}</div>
                                                                </div>
                                                            ) : (
                                                                <div className="font-semibold text-gray-100 text-base mt-1">Unknown</div>
                                                            )}
                                                        </div>

                                                        {/* Input Type */}
                                                        <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                                                            <div className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-2">Input Type</div>
                                                            <div className="font-semibold text-gray-100 text-base capitalize mt-1">{action.input_type}</div>
                                                        </div>

                                                        {/* Token Usage */}
                                                        <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                                                            <div className="flex items-center gap-1.5 mb-2">
                                                                <Zap className="w-4 h-4 text-yellow-400" />
                                                                <span className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Tokens</span>
                                                            </div>
                                                            <div className="text-sm space-y-1 mt-1">
                                                                <div className="flex justify-between items-center text-gray-200">
                                                                    <span>In:</span>
                                                                    <span className="font-semibold text-gray-100">{action.token_usage.prompt_tokens.toLocaleString()}</span>
                                                                </div>
                                                                <div className="flex justify-between items-center text-gray-200">
                                                                    <span>Out:</span>
                                                                    <span className="font-semibold text-gray-100">{action.token_usage.completion_tokens.toLocaleString()}</span>
                                                                </div>
                                                                <div className="flex justify-between items-center border-t border-slate-600 pt-1 mt-1">
                                                                    <span className="text-gray-100 font-semibold">Total:</span>
                                                                    <span className="font-bold text-yellow-400">{action.token_usage.total_tokens.toLocaleString()}</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* User Agent */}
                                                        <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                                                            <div className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-2">User Agent</div>
                                                            <div className="font-semibold text-gray-100 text-base truncate mt-1" title={action.user_agent || 'Unknown'}>
                                                                {action.user_agent ? action.user_agent.split(' ')[0] : 'Unknown'}
                                                            </div>
                                                            <div className="text-sm text-gray-300 mt-1">
                                                                IP: {action.user_ip || 'Unknown'}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Input and Output Content */}
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        {/* Input Content */}
                                                        <div className="bg-slate-700/50 rounded-lg p-5 border border-slate-600">
                                                            <div className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-3">Input Content</div>
                                                            <div className="bg-slate-900/50 p-4 rounded border border-slate-600 max-h-80 overflow-y-auto">
                                                                {action.input_content && action.input_content.trim() ? (
                                                                    <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-gray-100">
                                                                        {action.input_content}
                                                                    </pre>
                                                                ) : (
                                                                    <div className="text-slate-400 italic text-sm">No input content available</div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Output Content */}
                                                        <div className="bg-slate-700/50 rounded-lg p-5 border border-slate-600">
                                                            <div className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-3">Output Content</div>
                                                            <div className="bg-slate-900/50 p-4 rounded border border-slate-600 max-h-80 overflow-y-auto">
                                                                {action.action_type === 'summarize' && typeof action.output_content === 'object' && action.output_content?.summary ? (
                                                                    <div className="space-y-4 text-gray-100">
                                                                        <div>
                                                                            <div className="font-semibold text-blue-400 text-sm mb-2">Summary:</div>
                                                                            <p className="leading-relaxed text-sm">{action.output_content.summary}</p>
                                                                        </div>
                                                                        {action.output_content.category && (
                                                                            <div className="flex items-baseline gap-2">
                                                                                <span className="font-semibold text-purple-400 text-sm">Category:</span>
                                                                                <span className="text-sm">{action.output_content.category}</span>
                                                                            </div>
                                                                        )}
                                                                        {action.output_content.readingTime && (
                                                                            <div className="flex items-baseline gap-2">
                                                                                <span className="font-semibold text-green-400 text-sm">Reading Time:</span>
                                                                                <span className="text-sm">{action.output_content.readingTime} min</span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ) : action.action_type === 'fact-check' && typeof action.output_content === 'object' && action.output_content ? (
                                                                    <div className="space-y-4 text-gray-100">
                                                                        {action.output_content.score !== undefined && action.output_content.score !== null ? (
                                                                            <div className="flex items-baseline gap-2">
                                                                                <span className="font-semibold text-yellow-400 text-sm">Score:</span>
                                                                                <span className="text-lg font-bold">{action.output_content.score}/100</span>
                                                                            </div>
                                                                        ) : null}
                                                                        {action.output_content.reason ? (
                                                                            <div>
                                                                                <div className="font-semibold text-blue-400 text-sm mb-2">Reason:</div>
                                                                                <p className="leading-relaxed text-sm">{action.output_content.reason}</p>
                                                                            </div>
                                                                        ) : null}
                                                                        {action.output_content.sources && action.output_content.sources.length > 0 ? (
                                                                            <div>
                                                                                <div className="font-semibold text-green-400 text-sm mb-2">Sources:</div>
                                                                                <ul className="list-disc list-inside ml-2 space-y-1.5">
                                                                                    {action.output_content.sources.map((source: string, idx: number) => (
                                                                                        <li key={idx} className="text-sm break-all">
                                                                                            <a href={source} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 hover:underline">
                                                                                                {source}
                                                                                            </a>
                                                                                        </li>
                                                                                    ))}
                                                                                </ul>
                                                                            </div>
                                                                        ) : null}
                                                                        {!action.output_content.score && !action.output_content.reason && (!action.output_content.sources || action.output_content.sources.length === 0) && (
                                                                            <div className="text-slate-400 italic text-sm">No fact-check details available</div>
                                                                        )}
                                                                    </div>
                                                                ) : action.output_content && (typeof action.output_content === 'string' || Object.keys(action.output_content).length > 0) ? (
                                                                    <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-gray-100">
                                                                        {typeof action.output_content === 'string'
                                                                            ? action.output_content
                                                                            : JSON.stringify(action.output_content, null, 2)}
                                                                    </pre>
                                                                ) : (
                                                                    <div className="text-slate-400 italic text-sm">No output content available</div>
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
