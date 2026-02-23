'use client';

import React, { useEffect, useState } from 'react';

interface EvaluationMetrics {
  rouge1: number;
  rouge2: number;
  rougeL: number;
  bleu: number;
  bert_score?: number | null;
  compression_rate?: number | null;
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
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const LIMIT = 50;

  const fetchMetrics = async (currentOffset: number = 0, isInitial: boolean = false) => {
    if (isInitial) setLoading(true);
    else setLoadingMore(true);

    try {
      const response = await fetch(`/api/metrics?limit=${LIMIT}&offset=${currentOffset}`);
      const result = await response.json();
      
      if (isInitial) {
        setMetrics(result.data);
      } else {
        setMetrics(prev => [...prev, ...result.data]);
      }
      
      setHasMore(result.data.length === LIMIT);
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
  }, []);

  const handleShowMore = () => {
    const nextOffset = offset + LIMIT;
    setOffset(nextOffset);
    fetchMetrics(nextOffset, false);
  };
  
  const handleRefresh = () => {
    setOffset(0);
    fetchMetrics(0, true);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">Evaluation Metrics</h1>
            <p className="text-sm text-gray-500 mt-1">Last updated: {lastUpdated || 'Loading...'}</p>
          </div>
          <button 
            onClick={handleRefresh}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            🔄 Refresh
          </button>
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
                <th className="px-4 py-3 border-b-2 border-gray-200 bg-gray-50 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider min-w-[110px]">
                  URL
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {metrics.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 bg-white text-sm text-center text-gray-500">
                    No evaluation metrics found.
                  </td>
                </tr>
              ) : (
                metrics.map((item, index) => (
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

        {/* Load More Button */}
        {!loading && metrics.length > 0 && hasMore && (
          <div className="p-5 border-t border-gray-200 bg-gray-50 flex justify-center">
            <button
              onClick={handleShowMore}
              disabled={loadingMore}
              className="px-6 py-2 border border-blue-600 text-blue-600 font-medium rounded-md hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[140px]"
            >
              {loadingMore ? (
                <>
                  <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                  Loading...
                </>
              ) : (
                'Show More'
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
