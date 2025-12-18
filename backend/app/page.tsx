'use client'

import { useEffect, useState } from 'react'
import { RealtimeProvider, useRealtime } from '@/components/RealtimeProvider'
import { ActionLogsTable } from '@/components/ActionLogsTable'
import { Activity, Wifi, WifiOff, TrendingUp, Zap, Clock, BarChart3, Search, Filter } from 'lucide-react'
import type { ActionStats, UserAction } from '../../shared/types'

function DashboardContent() {
  const [stats, setStats] = useState<ActionStats | null>(null)
  const [actions, setActions] = useState<UserAction[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({
    actionType: '',
    website: '',
    startDate: '',
    endDate: '',
  })
  const { isConnected } = useRealtime()

  // Fetch stats
  useEffect(() => {
    fetchStats()
  }, [])

  // Fetch actions when filters change
  useEffect(() => {
    fetchActions()
  }, [filters])

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/actions/stats', {
        credentials: 'include'
      })
      if (response.ok) {
        const data = await response.json()
        setStats(data)
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  }

  const fetchActions = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('limit', '100')
      params.set('offset', '0')

      if (filters.actionType) params.set('action_type', filters.actionType)
      if (filters.website) params.set('website', filters.website)
      if (filters.startDate) params.set('start_date', filters.startDate)
      if (filters.endDate) params.set('end_date', filters.endDate)

      const response = await fetch(`/api/actions?${params}`, {
        credentials: 'include'
      })

      if (response.ok) {
        const data = await response.json()
        setActions(data.actions || [])
        setTotal(data.total || 0)
      }
    } catch (error) {
      console.error('Failed to fetch actions:', error)
    } finally {
      setLoading(false)
    }
  }

  const applyFilters = () => {
    fetchActions()
    setShowFilters(false)
  }

  const resetFilters = () => {
    setFilters({
      actionType: '',
      website: '',
      startDate: '',
      endDate: '',
    })
    setSearchQuery('')
  }

  // Filter actions by search query
  const filteredActions = actions.filter(action => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      action.input_content.toLowerCase().includes(query) ||
      action.website.toLowerCase().includes(query) ||
      action.action_type.toLowerCase().includes(query)
    )
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Fiber Analytics</h1>
                <p className="text-xs text-gray-500">Real-time monitoring dashboard</p>
              </div>
            </div>

            {/* Navigation, Status, and Actions */}
            <div className="flex items-center gap-4">
              {/* Navigation Buttons */}
              <nav className="flex items-center gap-1">
                <a
                  href="/"
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  Dashboard
                </a>
                <a
                  href="/live"
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  Live
                </a>
                <a
                  href="/debug"
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  Debug
                </a>
              </nav>

              {/* Divider */}
              <div className="h-6 w-px bg-gray-200" />

              {/* Connection Status */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-50">
                {isConnected ? (
                  <>
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-xs text-gray-700 font-medium">Live</span>
                  </>
                ) : (
                  <>
                    <div className="w-2 h-2 bg-gray-400 rounded-full" />
                    <span className="text-xs text-gray-500">Offline</span>
                  </>
                )}
              </div>

              {/* Sign Out Button */}
              <button
                onClick={async () => {
                  // Clear any stored tokens
                  document.cookie = 'sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;'
                  // Redirect to login
                  window.location.href = '/admin/login'
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg border border-gray-200 transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto px-6 py-6">
        {/* Stats Cards - 4 in a row */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {/* Total Actions */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-blue-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {stats?.total_actions?.toLocaleString() || 0}
            </div>
            <div className="text-sm text-gray-500 mt-1">Total Actions</div>
          </div>

          {/* Total Tokens */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-yellow-50 rounded-lg flex items-center justify-center">
                <Zap className="w-5 h-5 text-yellow-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {stats?.total_tokens?.toLocaleString() || 0}
            </div>
            <div className="text-sm text-gray-500 mt-1">Total Tokens</div>
          </div>

          {/* Avg Processing Time */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-purple-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {stats?.avg_processing_time || 0}ms
            </div>
            <div className="text-sm text-gray-500 mt-1">Avg Response Time</div>
          </div>

          {/* Actions Today */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {stats?.actions_today || 0}
            </div>
            <div className="text-sm text-gray-500 mt-1">Actions Today</div>
          </div>
        </div>

        {/* Search Bar and Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex items-center gap-3">
            {/* Search Input */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search actions by content, website, or type..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent text-sm"
              />
            </div>

            {/* Filter Button */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${showFilters
                ? 'bg-black text-white border-black'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
            >
              <Filter className="w-4 h-4" />
              Filters
            </button>
          </div>

          {/* Filter Panel */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="grid grid-cols-4 gap-4">
                {/* Action Type */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Action Type
                  </label>
                  <select
                    value={filters.actionType}
                    onChange={(e) => setFilters({ ...filters, actionType: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  >
                    <option value="">All Types</option>
                    <option value="summarize">Summarize</option>
                    <option value="fact-check">Fact Check</option>
                  </select>
                </div>

                {/* Website */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Website
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., vnexpress.net"
                    value={filters.website}
                    onChange={(e) => setFilters({ ...filters, website: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>

                {/* Start Date */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>

                {/* End Date */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>
              </div>

              {/* Filter Actions */}
              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={applyFilters}
                  className="px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
                >
                  Apply Filters
                </button>
                <button
                  onClick={resetFilters}
                  className="px-4 py-2 bg-white text-gray-700 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Reset
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Action Logs Table - Full Width */}
        <ActionLogsTable initialActions={filteredActions} total={total} loading={loading} />
      </main>
    </div>
  )
}

export default function AdminDashboard() {
  // Get Supabase credentials from environment
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-md">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Configuration Required</h2>
          <p className="text-gray-600 mb-4">
            Please set the following environment variables in your <code className="bg-gray-100 px-2 py-1 rounded">.env</code> file:
          </p>
          <ul className="list-disc list-inside text-sm text-gray-600 space-y-2">
            <li><code className="bg-gray-100 px-2 py-1 rounded">NEXT_PUBLIC_SUPABASE_URL</code></li>
            <li><code className="bg-gray-100 px-2 py-1 rounded">NEXT_PUBLIC_SUPABASE_ANON_KEY</code></li>
          </ul>
        </div>
      </div>
    )
  }

  return (
    <RealtimeProvider supabaseUrl={supabaseUrl} supabaseAnonKey={supabaseAnonKey}>
      <DashboardContent />
    </RealtimeProvider>
  )
}
