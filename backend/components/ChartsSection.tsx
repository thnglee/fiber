'use client'

import { useEffect, useState } from 'react'
import { LineChart, Line, PieChart, Pie, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'
import type { ActionStats } from '../../shared/types'
import { useRealtime } from './RealtimeProvider'

interface ChartsSectionProps {
    stats: ActionStats | null
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

export function ChartsSection({ stats }: ChartsSectionProps) {
    const [localStats, setLocalStats] = useState(stats)
    const { newAction } = useRealtime()

    // Update stats when new action arrives
    useEffect(() => {
        if (newAction && localStats) {
            setLocalStats((prev) => {
                if (!prev) return prev

                return {
                    ...prev,
                    total_actions: prev.total_actions + 1,
                    total_tokens: prev.total_tokens + newAction.token_usage.total_tokens,
                    actions_by_type: {
                        ...prev.actions_by_type,
                        [newAction.action_type]: (prev.actions_by_type[newAction.action_type] || 0) + 1,
                    },
                    actions_by_website: {
                        ...prev.actions_by_website,
                        [newAction.website]: (prev.actions_by_website[newAction.website] || 0) + 1,
                    },
                }
            })
        }
    }, [newAction, localStats])

    if (!localStats) {
        return null
    }

    // Prepare data for charts
    const actionsByTypeData = Object.entries(localStats.actions_by_type).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value,
    }))

    const actionsByWebsiteData = Object.entries(localStats.actions_by_website).map(([name, value]) => ({
        name,
        actions: value,
    }))

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Actions by Type - Pie Chart */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Actions by Type</h3>
                <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                        <Pie
                            data={actionsByTypeData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                        >
                            {actionsByTypeData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip />
                    </PieChart>
                </ResponsiveContainer>
            </div>

            {/* Actions by Website - Bar Chart */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Actions by Website</h3>
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={actionsByWebsiteData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="actions" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}
