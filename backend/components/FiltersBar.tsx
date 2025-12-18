'use client'

import { useState } from 'react'
import { Filter } from 'lucide-react'

interface FiltersBarProps {
    onFilterChange: (filters: {
        actionType: string
        website: string
        startDate: string
        endDate: string
    }) => void
}

export function FiltersBar({ onFilterChange }: FiltersBarProps) {
    const [actionType, setActionType] = useState('')
    const [website, setWebsite] = useState('')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')

    const handleApplyFilters = () => {
        onFilterChange({ actionType, website, startDate, endDate })
    }

    const handleReset = () => {
        setActionType('')
        setWebsite('')
        setStartDate('')
        setEndDate('')
        onFilterChange({ actionType: '', website: '', startDate: '', endDate: '' })
    }

    return (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
                <Filter className="w-5 h-5 text-gray-500" />
                <h3 className="text-lg font-semibold text-gray-900">Filters</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                    <label htmlFor="actionType" className="block text-sm font-medium text-gray-700 mb-2">
                        Action Type
                    </label>
                    <select
                        id="actionType"
                        value={actionType}
                        onChange={(e) => setActionType(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent text-sm"
                    >
                        <option value="">All Types</option>
                        <option value="summarize">Summarize</option>
                        <option value="fact-check">Fact Check</option>
                    </select>
                </div>

                <div>
                    <label htmlFor="website" className="block text-sm font-medium text-gray-700 mb-2">
                        Website
                    </label>
                    <input
                        id="website"
                        type="text"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        placeholder="e.g., vnexpress.net"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent text-sm"
                    />
                </div>

                <div>
                    <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-2">
                        Start Date
                    </label>
                    <input
                        id="startDate"
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent text-sm"
                    />
                </div>

                <div>
                    <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-2">
                        End Date
                    </label>
                    <input
                        id="endDate"
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent text-sm"
                    />
                </div>
            </div>

            <div className="flex gap-3 mt-4">
                <button
                    onClick={handleApplyFilters}
                    className="px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
                >
                    Apply Filters
                </button>
                <button
                    onClick={handleReset}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                >
                    Reset
                </button>
            </div>
        </div>
    )
}
