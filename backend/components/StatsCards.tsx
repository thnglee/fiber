'use client'

import { Activity, Zap, Clock, TrendingUp } from 'lucide-react'
import type { ActionStats } from '../../shared/types'

interface StatsCardsProps {
    stats: ActionStats | null
    loading: boolean
}

export function StatsCards({ stats, loading }: StatsCardsProps) {
    if (loading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
                        <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
                        <div className="h-8 bg-gray-200 rounded w-3/4"></div>
                    </div>
                ))}
            </div>
        )
    }

    if (!stats) {
        return null
    }

    const cards = [
        {
            title: 'Total Actions',
            value: stats.total_actions.toLocaleString(),
            icon: Activity,
            color: 'text-blue-600',
            bgColor: 'bg-blue-50',
        },
        {
            title: 'Total Tokens',
            value: stats.total_tokens.toLocaleString(),
            icon: Zap,
            color: 'text-yellow-600',
            bgColor: 'bg-yellow-50',
        },
        {
            title: 'Avg Processing Time',
            value: `${stats.avg_processing_time}ms`,
            icon: Clock,
            color: 'text-green-600',
            bgColor: 'bg-green-50',
        },
        {
            title: 'Actions Today',
            value: stats.actions_today.toLocaleString(),
            icon: TrendingUp,
            color: 'text-purple-600',
            bgColor: 'bg-purple-50',
        },
    ]

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {cards.map((card) => {
                const Icon = card.icon
                return (
                    <div
                        key={card.title}
                        className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-sm font-medium text-gray-500">{card.title}</span>
                            <div className={`${card.bgColor} p-2 rounded-lg`}>
                                <Icon className={`w-5 h-5 ${card.color}`} />
                            </div>
                        </div>
                        <div className="text-3xl font-bold text-gray-900">{card.value}</div>
                    </div>
                )
            })}
        </div>
    )
}
