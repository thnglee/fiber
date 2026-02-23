'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface EvaluationMetrics {
  rouge1: number;
  rouge2: number;
  rougeL: number;
  bleu: number;
  bert_score?: number | null;
}

interface EvaluationData {
  summary: string;
  original: string;
  url?: string;
  metrics: EvaluationMetrics;
  created_at?: string;
  latency?: number;
}

export default function EvaluationDashboard() {
  const [metrics, setMetrics] = useState<EvaluationData[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/metrics?limit=20&offset=0');
        const result = await response.json();
        setMetrics(result.data);
        setLastUpdated(new Date().toLocaleString());
      } catch (error) {
        console.error('Failed to fetch metrics:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchMetrics();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">Evaluation Metrics</h1>
            <p className="text-sm text-gray-500 mt-1">Last updated: {lastUpdated || 'Loading...'}</p>
          </div>
          <Link 
            href="/metrics" 
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            🔄 Refresh
          </Link>
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
                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Summary Preview
                </th>
                <th className="px-5 py-4 border-b-2 border-gray-200 bg-gray-100 text-left">
                  <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider">ROUGE-1</div>
                  <div className="text-xs font-normal text-gray-500 normal-case mt-1">Unigram overlap - content coverage</div>
                </th>
                <th className="px-5 py-4 border-b-2 border-gray-200 bg-gray-100 text-left">
                  <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider">ROUGE-2</div>
                  <div className="text-xs font-normal text-gray-500 normal-case mt-1">Bigram overlap - phrase similarity</div>
                </th>
                <th className="px-5 py-4 border-b-2 border-gray-200 bg-gray-100 text-left">
                  <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider">ROUGE-L</div>
                  <div className="text-xs font-normal text-gray-500 normal-case mt-1">Longest common subsequence - coherence</div>
                </th>
                <th className="px-5 py-4 border-b-2 border-gray-200 bg-gray-100 text-left">
                  <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider">BLEU</div>
                  <div className="text-xs font-normal text-gray-500 normal-case mt-1">N-gram precision - faithfulness</div>
                </th>
                <th className="px-5 py-4 border-b-2 border-gray-200 bg-gray-100 text-left">
                  <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider">BERTScore</div>
                  <div className="text-xs font-normal text-gray-500 normal-case mt-1">Semantic similarity &mdash; neural</div>
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Latency
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  URL
                </th>
              </tr>
            </thead>
            <tbody>
              {metrics.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-5 border-b border-gray-200 bg-white text-sm text-center">
                    No evaluation metrics found.
                  </td>
                </tr>
              ) : (
                metrics.map((item, index) => (
                  <tr key={index}>
                    <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                      {item.created_at ? new Date(item.created_at).toLocaleString() : 'N/A'}
                    </td>
                    <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm max-w-xs truncate" title={item.summary}>
                      {item.summary}
                    </td>
                    <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                      {item.metrics.rouge1}
                    </td>
                    <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                      {item.metrics.rouge2}
                    </td>
                    <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                      {item.metrics.rougeL}
                    </td>
                    <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                      {item.metrics.bleu}
                    </td>
                    <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                      {item.metrics.bert_score != null ? item.metrics.bert_score.toFixed(4) : 'N/A'}
                    </td>
                    <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                      {item.latency ? `${item.latency} ms` : 'N/A'}
                    </td>
                    <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm max-w-xs truncate">
                      {item.url ? (
                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700">
                          Link
                        </a>
                      ) : (
                        'N/A'
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}
      </div>
    </div>
  );
}
