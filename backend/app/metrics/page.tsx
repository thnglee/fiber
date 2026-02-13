import React from 'react';
import { getEvaluationMetrics } from '@/services/evaluation.service';
import { MetricTooltip } from '@/components/MetricTooltip';
import Link from 'next/link';

// Force dynamic rendering - no static generation
export const dynamic = 'force-dynamic';
// Disable all caching - revalidate on every request
export const revalidate = 0;

export default async function EvaluationDashboard() {
  const { data: metrics } = await getEvaluationMetrics(50, 0);
  const lastUpdated = new Date().toLocaleString();

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">Evaluation Metrics</h1>
            <p className="text-sm text-gray-500 mt-1">Last updated: {lastUpdated}</p>
          </div>
          <Link 
            href="/metrics" 
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            🔄 Refresh
          </Link>
        </div>
      
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
                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  <MetricTooltip 
                    title="ROUGE-1 (Recall)"
                    description="Measures the overlap of unigrams (single words) between the generated summary and the original text. Higher scores indicate better content coverage. Recall-based: focuses on how much of the original appears in the summary."
                  >
                    <span>ROUGE-1</span>
                  </MetricTooltip>
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  <MetricTooltip 
                    title="ROUGE-2 (Recall)"
                    description="Measures the overlap of bigrams (two adjacent words) between the summary and original. Captures fluency and phrase-level similarity. Higher scores suggest the summary maintains the original phrasing."
                  >
                    <span>ROUGE-2</span>
                  </MetricTooltip>
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  <MetricTooltip 
                    title="ROUGE-L (Recall)"
                    description="Measures the Longest Common Subsequence between texts. Captures sentence-level structure similarity without requiring consecutive matches. Better at evaluating overall coherence."
                  >
                    <span>ROUGE-L</span>
                  </MetricTooltip>
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  <MetricTooltip 
                    title="BLEU (Precision)"
                    description="Bilingual Evaluation Understudy - measures precision of n-grams with brevity penalty. Checks if the summary uses words from the source without hallucinating. Higher scores mean the summary stays faithful to the original."
                  >
                    <span>BLEU</span>
                  </MetricTooltip>
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  URL
                </th>
              </tr>
            </thead>
            <tbody>
              {metrics.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-5 border-b border-gray-200 bg-white text-sm text-center">
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
      </div>
    </div>
  );
}
