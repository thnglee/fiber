'use client';

import React, { useEffect, useState } from 'react';
import { Search, Filter } from 'lucide-react';

interface EvaluationMetrics {
  rouge1: number;
  rouge2: number;
  rougeL: number;
  bleu: number;
  bert_score?: number | null;
  compression_rate?: number | null;
  total_tokens?: number | null;
}

interface EvaluationData {
  summary: string;
  original: string;
  url?: string;
  metrics: EvaluationMetrics;
  created_at?: string;
  latency?: number;
  mode?: string | null;
}

export default function EvaluationDashboard() {
  const [metrics, setMetrics] = useState<EvaluationData[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState({
    mode: '',
    url: '',
    startDate: '',
    endDate: '',
  });
  const LIMIT = 50;

  const fetchMetrics = async (currentOffset: number = 0, isInitial: boolean = false) => {
    if (isInitial) setLoading(true);
    else setLoadingMore(true);

    try {
      const params = new URLSearchParams();
      params.set('limit', LIMIT.toString());
      params.set('offset', currentOffset.toString());

      if (filters.mode) params.set('mode', filters.mode);
      if (filters.url) params.set('url', filters.url);
      if (filters.startDate) params.set('start_date', filters.startDate);
      if (filters.endDate) params.set('end_date', filters.endDate);

      const response = await fetch(`/api/metrics?${params}`);
      const result = await response.json();
      
      if (isInitial) {
        setMetrics(result.data);
      } else {
        setMetrics(prev => [...prev, ...result.data]);
      }
      
      setTotal(result.count || 0);
      setLastUpdated(new Date().toLocaleString());
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    } finally {
      if (isInitial) setLoading(false);
      else setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchMetrics(0, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const handleShowMore = () => {
    const nextOffset = offset + LIMIT;
    setOffset(nextOffset);
    fetchMetrics(nextOffset, false);
  };
  
  const applyFilters = () => {
    setOffset(0);
    fetchMetrics(0, true);
    setShowFilters(false);
  };

  const resetFilters = () => {
    setFilters({
      mode: '',
      url: '',
      startDate: '',
      endDate: '',
    });
    setSearchQuery('');
    setOffset(0);
  };

  // Filter actions by search query
  const filteredMetrics = metrics.filter(item => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      item.summary.toLowerCase().includes(query) ||
      (item.url && item.url.toLowerCase().includes(query)) ||
      (item.mode && item.mode.toLowerCase().includes(query))
    );
  });

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">Evaluation Metrics</h1>
            <p className="text-sm text-gray-500 mt-1">Last updated: {lastUpdated || 'Loading...'}</p>
          </div>
        </div>

        {/* Search Bar and Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex items-center gap-3">
            {/* Search Input */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search metrics by summary, url, or mode..."
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
                {/* Mode */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Mode
                  </label>
                  <select
                    value={filters.mode}
                    onChange={(e) => setFilters({ ...filters, mode: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  >
                    <option value="">All Modes</option>
                    <option value="stream">Stream</option>
                    <option value="sync">Sync</option>
                  </select>
                </div>

                {/* URL */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    URL
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., example.com"
                    value={filters.url}
                    onChange={(e) => setFilters({ ...filters, url: e.target.value })}
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
      
      {loading ? (
        <div className="bg-white shadow-md rounded-lg p-8 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading metrics...</p>
        </div>
      ) : (
      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full leading-normal">
            <thead>
              <tr>
                <th className="px-4 py-3 border-b-2 border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider min-w-[120px]">
                  Date
                </th>
                <th className="px-4 py-3 border-b-2 border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider min-w-[200px]">
                  Summary Preview
                </th>
                <th className="px-4 py-3 border-b-2 border-gray-200 bg-gray-50 text-left min-w-[120px]">
                  <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider">ROUGE-1</div>
                  <div className="text-[10px] font-normal text-gray-500 normal-case mt-0.5">Unigram overlap</div>
                </th>
                <th className="px-4 py-3 border-b-2 border-gray-200 bg-gray-50 text-left min-w-[120px]">
                  <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider">ROUGE-2</div>
                  <div className="text-[10px] font-normal text-gray-500 normal-case mt-0.5">Bigram overlap</div>
                </th>
                <th className="px-4 py-3 border-b-2 border-gray-200 bg-gray-50 text-left min-w-[130px]">
                  <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider">ROUGE-L</div>
                  <div className="text-[10px] font-normal text-gray-500 normal-case mt-0.5">Longest common sub.</div>
                </th>
                <th className="px-4 py-3 border-b-2 border-gray-200 bg-gray-50 text-left min-w-[110px]">
                  <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider">BLEU</div>
                  <div className="text-[10px] font-normal text-gray-500 normal-case mt-0.5">N-gram precision</div>
                </th>
                <th className="px-4 py-3 border-b-2 border-gray-200 bg-gray-50 text-left min-w-[120px]">
                  <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider">BERTScore</div>
                  <div className="text-[10px] font-normal text-gray-500 normal-case mt-0.5">Semantic similarity</div>
                </th>
                <th className="px-4 py-3 border-b-2 border-gray-200 bg-gray-50 text-left min-w-[100px]">
                  <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Latency</div>
                  <div className="text-[10px] font-normal text-gray-500 normal-case mt-0.5">first-chunk/full</div>
                </th>
                <th className="px-4 py-3 border-b-2 border-gray-200 bg-gray-50 text-left min-w-[90px]">
                  <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Mode</div>
                  <div className="text-[10px] font-normal text-gray-500 normal-case mt-0.5">stream/sync</div>
                </th>
                <th className="px-4 py-3 border-b-2 border-gray-200 bg-gray-50 text-left min-w-[120px]">
                  <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Compression</div>
                  <div className="text-[10px] font-normal text-gray-500 normal-case mt-0.5">summary/original</div>
                </th>
                <th className="px-4 py-3 border-b-2 border-gray-200 bg-gray-50 text-left min-w-[110px]">
                  <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Total Tokens</div>
                  <div className="text-[10px] font-normal text-gray-500 normal-case mt-0.5">prompt + completion</div>
                </th>
                <th className="px-4 py-3 border-b-2 border-gray-200 bg-gray-50 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider min-w-[110px]">
                  URL
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredMetrics.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 bg-white text-sm text-center text-gray-500">
                    No evaluation metrics found.
                  </td>
                </tr>
              ) : (
                filteredMetrics.map((item, index) => (
                  <tr key={index} className="hover:bg-blue-50/50 transition-colors bg-white">
                    <td className="px-4 py-4 bg-transparent text-sm text-gray-700 whitespace-nowrap">
                      {item.created_at ? new Date(item.created_at).toLocaleString() : 'N/A'}
                    </td>
                    <td className="px-4 py-4 bg-transparent text-sm max-w-xs truncate text-gray-600" title={item.summary}>
                      {item.summary}
                    </td>
                    <td className="px-4 py-4 bg-transparent text-sm text-gray-800 font-medium">
                      {item.metrics.rouge1}
                    </td>
                    <td className="px-4 py-4 bg-transparent text-sm text-gray-800 font-medium">
                      {item.metrics.rouge2}
                    </td>
                    <td className="px-4 py-4 bg-transparent text-sm text-gray-800 font-medium">
                      {item.metrics.rougeL}
                    </td>
                    <td className="px-4 py-4 bg-transparent text-sm text-gray-800 font-medium">
                      {item.metrics.bleu}
                    </td>
                    <td className="px-4 py-4 bg-transparent text-sm text-gray-800 font-medium">
                      {item.metrics.bert_score != null ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-green-50 text-green-700">
                          {item.metrics.bert_score.toFixed(4)}
                        </span>
                      ) : 'N/A'}
                    </td>
                    <td className="px-4 py-4 bg-transparent text-sm text-gray-600 whitespace-nowrap">
                      {item.latency ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-700">
                          {item.latency} ms
                        </span>
                      ) : 'N/A'}
                    </td>
                    <td className="px-4 py-4 bg-transparent text-sm">
                      {item.mode ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wider ${item.mode === 'stream' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                          {item.mode}
                        </span>
                      ) : (
                        <span className="text-gray-400">N/A</span>
                      )}
                    </td>
                    <td className="px-4 py-4 bg-transparent text-sm text-gray-600">
                      {item.metrics.compression_rate != null
                        ? `${item.metrics.compression_rate.toFixed(2)}%`
                        : 'N/A'}
                    </td>
                    <td className="px-4 py-4 bg-transparent text-sm text-gray-600">
                      {item.metrics.total_tokens != null ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-amber-50 text-amber-700">
                          {item.metrics.total_tokens.toLocaleString()}
                        </span>
                      ) : 'N/A'}
                    </td>
                    <td className="px-4 py-4 bg-transparent text-sm text-center">
                      {item.url ? (
                        <a 
                          href={item.url} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="inline-flex items-center justify-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                        >
                          Source
                        </a>
                      ) : (
                        <span className="text-gray-400 text-xs italic">N/A</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Show More Button */}
        {!loading && metrics.length < total && (
          <div className="p-5 border-t border-gray-200 bg-gray-50 flex justify-center mt-6 rounded-lg">
            <button
              onClick={handleShowMore}
              disabled={loadingMore}
              className="px-6 py-2 border border-blue-600 text-blue-600 font-medium rounded-md hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[160px]"
            >
              {loadingMore ? (
                <>
                  <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                  Loading...
                </>
              ) : (
                `Show More (${total - metrics.length} remaining)`
              )}
            </button>
          </div>
        )}

      </div>
      )}
      </div>
    </div>
  );
}
