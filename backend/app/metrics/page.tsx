'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Search, Filter, Download, Trophy, Clock, DollarSign, ChevronDown, ChevronUp } from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────────

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
  model?: string;
  estimatedCostUsd?: number;
}

interface RoutingDecision {
  id: string;
  article_length: number | null;
  article_tokens: number | null;
  category: string | null;
  complexity: string;
  routing_mode: string;
  selected_model: string;
  fallback_used: boolean;
  fallback_reason: string | null;
  created_at: string;
}

interface ModelComparison {
  id: string;
  routing_id: string;
  model_name: string;
  summary: string;
  bert_score: number | null;
  rouge1: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  estimated_cost_usd: number | null;
  latency_ms: number | null;
  selected: boolean;
  created_at: string;
}

interface ModelDistItem {
  model: string;
  count: number;
  percentage: number;
}

interface AvgBertItem {
  model: string;
  avg_bert_score: number;
  count: number;
}

interface RoutingStats {
  total_decisions: number;
  fallback_rate: number;
  model_distribution: ModelDistItem[];
  most_used_model: ModelDistItem | null;
  avg_bert_scores: AvgBertItem[];
}

type Tab = 'evaluation' | 'routing';

// ── Bar colors for model distribution chart ─────────────────────────
const BAR_COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-purple-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-indigo-500',
  'bg-teal-500',
];

// ── Model color mapping ─────────────────────────────────────────────
const MODEL_COLORS: Record<string, { bg: string; border: string; text: string; ring: string }> = {
  'VietAI/vit5-large-vietnews-summarization': { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', ring: 'ring-blue-500' },
  'vinai/PhoGPT-4B-Chat': { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', ring: 'ring-purple-500' },
  'gpt-4o': { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', ring: 'ring-emerald-500' },
  'gpt-4o-mini': { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700', ring: 'ring-teal-500' },
};

const DEFAULT_MODEL_COLOR = { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', ring: 'ring-gray-500' };

function getModelColor(model: string) {
  return MODEL_COLORS[model] || DEFAULT_MODEL_COLOR;
}

// ── Score bar helper ────────────────────────────────────────────────
function ScoreBar({ value, max, label, color }: { value: number | null; max: number; label: string; color: string }) {
  if (value == null) return <span className="text-gray-400 text-xs">--</span>;
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">{label}</span>
        <span className="text-xs font-semibold text-gray-800">{value.toFixed(4)}</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
    </div>
  );
}

// ── Grouped evaluation results component ────────────────────────────
function EvalModeGroupedResults({
  evalDecisions,
  evalComparisons,
  evalTotal,
  evalLoadingMore,
  onShowMore,
  onExportCsv,
}: {
  evalDecisions: RoutingDecision[];
  evalComparisons: ModelComparison[];
  evalTotal: number;
  evalLoadingMore: boolean;
  onShowMore: () => void;
  onExportCsv: () => void;
}) {
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  // Group comparisons by routing_id
  const grouped = useMemo(() => {
    const map = new Map<string, ModelComparison[]>();
    for (const comp of evalComparisons) {
      const list = map.get(comp.routing_id) || [];
      list.push(comp);
      map.set(comp.routing_id, list);
    }

    // Sort comparisons within each group: winner first, then by bert_score desc
    for (const [, comps] of map) {
      comps.sort((a, b) => {
        if (a.selected && !b.selected) return -1;
        if (!a.selected && b.selected) return 1;
        return (Number(b.bert_score) || 0) - (Number(a.bert_score) || 0);
      });
    }

    // Return in the order of evalDecisions
    return evalDecisions
      .filter(d => map.has(d.id))
      .map(d => ({ decision: d, comparisons: map.get(d.id)! }));
  }, [evalDecisions, evalComparisons]);

  const toggleExpanded = (id: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          Evaluation Mode Results
          <span className="ml-2 text-sm font-normal text-gray-500">
            ({grouped.length} evaluation{grouped.length !== 1 ? 's' : ''})
          </span>
        </h2>
        <button
          onClick={onExportCsv}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {grouped.map(({ decision, comparisons }) => {
        const winner = comparisons.find(c => c.selected);
        const isExpanded = expandedCards.has(decision.id);

        // Find the best scores to highlight
        const bestBert = Math.max(...comparisons.map(c => Number(c.bert_score) || 0));
        const bestRouge = Math.max(...comparisons.map(c => Number(c.rouge1) || 0));
        const bestLatency = Math.min(...comparisons.filter(c => c.latency_ms != null).map(c => c.latency_ms!));
        const bestCost = Math.min(...comparisons.filter(c => c.estimated_cost_usd != null).map(c => Number(c.estimated_cost_usd)!));

        return (
          <div key={decision.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Card Header */}
            <button
              onClick={() => toggleExpanded(decision.id)}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">
                      {new Date(decision.created_at).toLocaleString()}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wider ${
                      decision.complexity === 'short'
                        ? 'bg-green-100 text-green-800'
                        : decision.complexity === 'medium'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {decision.complexity}
                    </span>
                    {decision.article_tokens != null && (
                      <span className="text-xs text-gray-400">{decision.article_tokens.toLocaleString()} tokens</span>
                    )}
                  </div>
                  {winner && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <Trophy className="w-3.5 h-3.5 text-amber-500" />
                      <span className="text-xs text-gray-600">
                        Winner: <span className="font-medium">{winner.model_name}</span>
                        {winner.bert_score != null && (
                          <span className="ml-1 text-green-700">(BERTScore: {Number(winner.bert_score).toFixed(4)})</span>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Mini score badges for quick overview */}
                <div className="hidden sm:flex items-center gap-2">
                  {comparisons.map(comp => {
                    const color = getModelColor(comp.model_name);
                    return (
                      <span
                        key={comp.id}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${color.bg} ${color.text} ${comp.selected ? 'ring-2 ' + color.ring : ''}`}
                        title={`${comp.model_name}: BERTScore ${comp.bert_score != null ? Number(comp.bert_score).toFixed(4) : 'N/A'}`}
                      >
                        {comp.model_name.split('/').pop()?.replace(/-large.*/, '')}
                        {comp.bert_score != null && (
                          <span className="font-semibold">{Number(comp.bert_score).toFixed(3)}</span>
                        )}
                      </span>
                    );
                  })}
                </div>
                {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
              </div>
            </button>

            {/* Expanded: Side-by-side model comparison */}
            {isExpanded && (
              <div className="px-6 pb-6 pt-2 border-t border-gray-100">
                <div className={`grid gap-4 ${comparisons.length === 2 ? 'grid-cols-2' : comparisons.length >= 3 ? 'grid-cols-3' : 'grid-cols-1'}`}>
                  {comparisons.map(comp => {
                    const color = getModelColor(comp.model_name);
                    const isBestBert = Number(comp.bert_score) === bestBert && bestBert > 0;
                    const isBestRouge = Number(comp.rouge1) === bestRouge && bestRouge > 0;
                    const isBestLatency = comp.latency_ms === bestLatency;
                    const isBestCost = Number(comp.estimated_cost_usd) === bestCost;

                    return (
                      <div
                        key={comp.id}
                        className={`rounded-lg border-2 p-4 transition-all ${
                          comp.selected
                            ? `${color.border} ${color.bg} ring-2 ${color.ring}`
                            : 'border-gray-150 bg-white'
                        }`}
                      >
                        {/* Model header */}
                        <div className="flex items-center justify-between mb-4">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${color.bg} ${color.text}`}>
                            {comp.model_name}
                          </span>
                          {comp.selected && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                              <Trophy className="w-3 h-3" />
                              Winner
                            </span>
                          )}
                        </div>

                        {/* Scores */}
                        <div className="space-y-3">
                          <div>
                            <ScoreBar
                              value={comp.bert_score != null ? Number(comp.bert_score) : null}
                              max={1}
                              label={`BERTScore${isBestBert ? ' (best)' : ''}`}
                              color={isBestBert ? 'bg-green-500' : 'bg-gray-300'}
                            />
                          </div>
                          <div>
                            <ScoreBar
                              value={comp.rouge1 != null ? Number(comp.rouge1) : null}
                              max={1}
                              label={`ROUGE-1${isBestRouge ? ' (best)' : ''}`}
                              color={isBestRouge ? 'bg-blue-500' : 'bg-gray-300'}
                            />
                          </div>
                        </div>

                        {/* Metrics row */}
                        <div className="flex items-center gap-3 mt-4 pt-3 border-t border-gray-100">
                          <div className="flex items-center gap-1 text-xs text-gray-600">
                            <Clock className="w-3.5 h-3.5" />
                            {comp.latency_ms != null ? (
                              <span className={isBestLatency ? 'font-semibold text-green-700' : ''}>
                                {comp.latency_ms.toLocaleString()}ms
                              </span>
                            ) : '--'}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-gray-600">
                            <DollarSign className="w-3.5 h-3.5" />
                            {comp.estimated_cost_usd != null ? (
                              <span className={isBestCost ? 'font-semibold text-green-700' : ''}>
                                ${Number(comp.estimated_cost_usd).toFixed(5)}
                              </span>
                            ) : '--'}
                          </div>
                        </div>

                        {/* Summary preview */}
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <p className="text-xs text-gray-500 line-clamp-3" title={comp.summary}>
                            {comp.summary}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Show More */}
      {evalDecisions.length < evalTotal && (
        <div className="flex justify-center">
          <button
            onClick={onShowMore}
            disabled={evalLoadingMore}
            className="px-6 py-2 border border-blue-600 text-blue-600 font-medium rounded-md hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[160px]"
          >
            {evalLoadingMore ? (
              <>
                <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                Loading...
              </>
            ) : (
              `Show More (${evalTotal - evalDecisions.length} remaining)`
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────

export default function EvaluationDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('evaluation');

  // ── Evaluation state (unchanged) ──────────────────────────────────
  const [metrics, setMetrics] = useState<EvaluationData[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [offset, setOffset] = useState(0);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [filters, setFilters] = useState({
    mode: '',
    model: '',
    url: '',
    startDate: '',
    endDate: '',
  });
  const LIMIT = 50;

  // ── Routing state ─────────────────────────────────────────────────
  const [routingDecisions, setRoutingDecisions] = useState<RoutingDecision[]>([]);
  const [, setRoutingComparisons] = useState<ModelComparison[]>([]);
  const [routingStats, setRoutingStats] = useState<RoutingStats | null>(null);
  const [routingTotal, setRoutingTotal] = useState(0);
  const [routingOffset, setRoutingOffset] = useState(0);
  const [routingLoading, setRoutingLoading] = useState(false);
  const [routingLoadingMore, setRoutingLoadingMore] = useState(false);

  // Evaluation-mode comparisons (for the sub-section)
  const [evalComparisons, setEvalComparisons] = useState<ModelComparison[]>([]);
  const [evalDecisions, setEvalDecisions] = useState<RoutingDecision[]>([]);
  const [evalTotal, setEvalTotal] = useState(0);
  const [evalOffset, setEvalOffset] = useState(0);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalLoadingMore, setEvalLoadingMore] = useState(false);

  // ── Evaluation metrics fetch (unchanged) ──────────────────────────

  const fetchMetrics = async (currentOffset: number = 0, isInitial: boolean = false) => {
    if (isInitial) setLoading(true);
    else setLoadingMore(true);

    try {
      const params = new URLSearchParams();
      params.set('limit', LIMIT.toString());
      params.set('offset', currentOffset.toString());

      if (filters.mode) params.set('mode', filters.mode);
      if (filters.model) params.set('model', filters.model);
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

  // ── Routing data fetches ──────────────────────────────────────────

  const fetchRoutingData = useCallback(async (currentOffset: number = 0, isInitial: boolean = false) => {
    if (isInitial) setRoutingLoading(true);
    else setRoutingLoadingMore(true);

    try {
      const params = new URLSearchParams();
      params.set('view', 'routing');
      params.set('limit', LIMIT.toString());
      params.set('offset', currentOffset.toString());

      const response = await fetch(`/api/metrics?${params}`);
      const result = await response.json();

      if (isInitial) {
        setRoutingDecisions(result.data || []);
      } else {
        setRoutingDecisions(prev => [...prev, ...(result.data || [])]);
      }

      setRoutingComparisons(prev =>
        isInitial ? (result.comparisons || []) : [...prev, ...(result.comparisons || [])]
      );
      setRoutingTotal(result.count || 0);
      setRoutingStats(result.stats || null);
      setLastUpdated(new Date().toLocaleString());
    } catch (error) {
      console.error('Failed to fetch routing data:', error);
    } finally {
      if (isInitial) setRoutingLoading(false);
      else setRoutingLoadingMore(false);
    }
  }, []);

  const fetchEvalModeData = useCallback(async (currentOffset: number = 0, isInitial: boolean = false) => {
    if (isInitial) setEvalLoading(true);
    else setEvalLoadingMore(true);

    try {
      const params = new URLSearchParams();
      params.set('view', 'routing');
      params.set('routing_mode', 'evaluation');
      params.set('limit', LIMIT.toString());
      params.set('offset', currentOffset.toString());

      const response = await fetch(`/api/metrics?${params}`);
      const result = await response.json();

      if (isInitial) {
        setEvalDecisions(result.data || []);
        setEvalComparisons(result.comparisons || []);
      } else {
        setEvalDecisions(prev => [...prev, ...(result.data || [])]);
        setEvalComparisons(prev => [...prev, ...(result.comparisons || [])]);
      }

      setEvalTotal(result.count || 0);
    } catch (error) {
      console.error('Failed to fetch evaluation mode data:', error);
    } finally {
      if (isInitial) setEvalLoading(false);
      else setEvalLoadingMore(false);
    }
  }, []);

  // ── Effects ───────────────────────────────────────────────────────

  // Fetch available models from settings API
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await fetch('/api/settings');
        const result = await response.json();
        if (result.available) {
          const models = result.available.map((m: { model_name: string }) => m.model_name);
          setAvailableModels(models);
        }
      } catch (error) {
        console.error('Failed to fetch available models:', error);
      }
    };
    fetchModels();
  }, []);

  useEffect(() => {
    if (activeTab === 'evaluation') {
      fetchMetrics(0, true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, activeTab]);

  useEffect(() => {
    if (activeTab === 'routing') {
      fetchRoutingData(0, true);
      fetchEvalModeData(0, true);
    }
  }, [activeTab, fetchRoutingData, fetchEvalModeData]);

  // ── Handlers ──────────────────────────────────────────────────────

  const handleShowMore = () => {
    const nextOffset = offset + LIMIT;
    setOffset(nextOffset);
    fetchMetrics(nextOffset, false);
  };

  const handleRoutingShowMore = () => {
    const nextOffset = routingOffset + LIMIT;
    setRoutingOffset(nextOffset);
    fetchRoutingData(nextOffset, false);
  };

  const handleEvalShowMore = () => {
    const nextOffset = evalOffset + LIMIT;
    setEvalOffset(nextOffset);
    fetchEvalModeData(nextOffset, false);
  };

  const applyFilters = () => {
    setOffset(0);
    fetchMetrics(0, true);
    setShowFilters(false);
  };

  const resetFilters = () => {
    setFilters({
      mode: '',
      model: '',
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
      (item.mode && item.mode.toLowerCase().includes(query)) ||
      (item.model && item.model.toLowerCase().includes(query))
    );
  });

  // ── CSV Export ────────────────────────────────────────────────────

  const exportEvalComparisonsCsv = () => {
    // Build rows from evalComparisons joined with evalDecisions
    const headers = [
      'Date',
      'Article Excerpt',
      'Model',
      'BERTScore',
      'ROUGE-1',
      'Latency (ms)',
      'Cost (USD)',
      'Selected',
    ];

    const csvRows = [headers.join(',')];

    for (const comp of evalComparisons) {
      const date = comp.created_at
        ? new Date(comp.created_at).toISOString()
        : '';
      // Use summary excerpt (first 80 chars), escape quotes
      const excerpt = `"${(comp.summary || '').slice(0, 80).replace(/"/g, '""')}"`;
      const row = [
        date,
        excerpt,
        comp.model_name,
        comp.bert_score != null ? comp.bert_score.toString() : '',
        comp.rouge1 != null ? comp.rouge1.toString() : '',
        comp.latency_ms != null ? comp.latency_ms.toString() : '',
        comp.estimated_cost_usd != null ? comp.estimated_cost_usd.toString() : '',
        comp.selected ? 'Yes' : 'No',
      ];
      csvRows.push(row.join(','));
    }

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `evaluation-mode-results-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">Evaluation Metrics</h1>
            <p className="text-sm text-gray-500 mt-1">Last updated: {lastUpdated || 'Loading...'}</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200 mb-6">
          <button
            onClick={() => setActiveTab('evaluation')}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'evaluation'
                ? 'border-b-2 border-black text-black'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Evaluation Metrics
          </button>
          <button
            onClick={() => setActiveTab('routing')}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'routing'
                ? 'border-b-2 border-black text-black'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Routing
          </button>
        </div>

        {/* ═══════════════════════════════════════════════════════════
            EVALUATION METRICS TAB
            ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'evaluation' && (
          <>
            {/* Search Bar and Filters */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
              <div className="flex items-center gap-3">
                {/* Search Input */}
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search metrics by summary, url, mode, or model..."
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
                  <div className="grid grid-cols-5 gap-4">
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

                    {/* Model */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-2">
                        Model
                      </label>
                      <select
                        value={filters.model}
                        onChange={(e) => setFilters({ ...filters, model: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black"
                      >
                        <option value="">All Models</option>
                        {availableModels.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
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
                        <th className="px-4 py-3 border-b-2 border-gray-200 bg-gray-50 text-left min-w-[140px] max-w-[180px]">
                          <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Model</div>
                          <div className="text-[10px] font-normal text-gray-500 normal-case mt-0.5">LLM used</div>
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
                        <th className="px-4 py-3 border-b-2 border-gray-200 bg-gray-50 text-left min-w-[100px]">
                          <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Est. Cost</div>
                          <div className="text-[10px] font-normal text-gray-500 normal-case mt-0.5">USD per request</div>
                        </th>
                        <th className="px-4 py-3 border-b-2 border-gray-200 bg-gray-50 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider min-w-[110px]">
                          URL
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredMetrics.length === 0 ? (
                        <tr>
                          <td colSpan={14} className="px-4 py-8 bg-white text-sm text-center text-gray-500">
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
                            <td className="px-4 py-4 bg-transparent text-sm max-w-[180px]">
                              {item.model ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs font-medium whitespace-nowrap truncate max-w-full" title={item.model}>
                                  {item.model.replace(/-\d{4}-\d{2}-\d{2}$/, '')}
                                </span>
                              ) : (
                                <span className="text-gray-400">&mdash;</span>
                              )}
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
                            <td className="px-4 py-4 bg-transparent text-sm text-gray-600">
                              {item.estimatedCostUsd != null ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700">
                                  ${item.estimatedCostUsd.toFixed(5)}
                                </span>
                              ) : (
                                <span className="text-gray-400">&mdash;</span>
                              )}
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
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════
            ROUTING TAB
            ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'routing' && (
          <>
            {routingLoading ? (
              <div className="bg-white shadow-md rounded-lg p-8 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="mt-4 text-gray-600">Loading routing data...</p>
              </div>
            ) : (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                  {/* Total Routed Requests */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <p className="text-sm text-gray-500 mb-1">Total Routed Requests</p>
                    <p className="text-3xl font-bold text-gray-900">
                      {routingStats?.total_decisions ?? 0}
                    </p>
                  </div>

                  {/* Fallback Rate */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <p className="text-sm text-gray-500 mb-1">Fallback Rate</p>
                    <p className="text-3xl font-bold text-gray-900">
                      {routingStats?.fallback_rate ?? 0}%
                    </p>
                  </div>

                  {/* Avg BERTScore (best model) */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <p className="text-sm text-gray-500 mb-1">Best Avg BERTScore</p>
                    {routingStats?.avg_bert_scores && routingStats.avg_bert_scores.length > 0 ? (
                      <>
                        <p className="text-3xl font-bold text-gray-900">
                          {routingStats.avg_bert_scores[0].avg_bert_score.toFixed(4)}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {routingStats.avg_bert_scores[0].model}
                        </p>
                      </>
                    ) : (
                      <p className="text-3xl font-bold text-gray-400">--</p>
                    )}
                  </div>

                  {/* Most Used Model */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <p className="text-sm text-gray-500 mb-1">Most Used Model</p>
                    {routingStats?.most_used_model ? (
                      <>
                        <p className="text-xl font-bold text-gray-900 truncate" title={routingStats.most_used_model.model}>
                          {routingStats.most_used_model.model}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {routingStats.most_used_model.percentage}% ({routingStats.most_used_model.count} requests)
                        </p>
                      </>
                    ) : (
                      <p className="text-3xl font-bold text-gray-400">--</p>
                    )}
                  </div>
                </div>

                {/* Model Distribution */}
                {routingStats?.model_distribution && routingStats.model_distribution.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Model Distribution</h2>
                    <div className="space-y-3">
                      {routingStats.model_distribution.map((item, idx) => (
                        <div key={item.model}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-gray-700">{item.model}</span>
                            <span className="text-sm text-gray-500">
                              {item.count} ({item.percentage}%)
                            </span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-3">
                            <div
                              className={`h-3 rounded-full ${BAR_COLORS[idx % BAR_COLORS.length]}`}
                              style={{ width: `${Math.max(item.percentage, 1)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent Routing Decisions Table */}
                <div className="bg-white shadow-md rounded-lg overflow-hidden mb-8">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-900">Recent Routing Decisions</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full leading-normal">
                      <thead>
                        <tr>
                          <th className="px-4 py-3 border-b-2 border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            Date
                          </th>
                          <th className="px-4 py-3 border-b-2 border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            Complexity
                          </th>
                          <th className="px-4 py-3 border-b-2 border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            Selected Model
                          </th>
                          <th className="px-4 py-3 border-b-2 border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            Routing Mode
                          </th>
                          <th className="px-4 py-3 border-b-2 border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            Fallback
                          </th>
                          <th className="px-4 py-3 border-b-2 border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            Article Tokens
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {routingDecisions.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 bg-white text-sm text-center text-gray-500">
                              No routing decisions found.
                            </td>
                          </tr>
                        ) : (
                          routingDecisions.map((d) => (
                            <tr key={d.id} className="hover:bg-blue-50/50 transition-colors bg-white">
                              <td className="px-4 py-4 bg-transparent text-sm text-gray-700 whitespace-nowrap">
                                {new Date(d.created_at).toLocaleString()}
                              </td>
                              <td className="px-4 py-4 bg-transparent text-sm">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wider ${
                                  d.complexity === 'short'
                                    ? 'bg-green-100 text-green-800'
                                    : d.complexity === 'medium'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-red-100 text-red-800'
                                }`}>
                                  {d.complexity}
                                </span>
                              </td>
                              <td className="px-4 py-4 bg-transparent text-sm">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs font-medium">
                                  {d.selected_model}
                                </span>
                              </td>
                              <td className="px-4 py-4 bg-transparent text-sm">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                  d.routing_mode === 'auto'
                                    ? 'bg-blue-100 text-blue-800'
                                    : d.routing_mode === 'evaluation'
                                    ? 'bg-purple-100 text-purple-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {d.routing_mode}
                                </span>
                              </td>
                              <td className="px-4 py-4 bg-transparent text-sm">
                                {d.fallback_used ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700" title={d.fallback_reason || ''}>
                                    Yes
                                  </span>
                                ) : (
                                  <span className="text-gray-400 text-xs">No</span>
                                )}
                              </td>
                              <td className="px-4 py-4 bg-transparent text-sm text-gray-600">
                                {d.article_tokens != null ? d.article_tokens.toLocaleString() : '--'}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Show More */}
                  {routingDecisions.length < routingTotal && (
                    <div className="p-5 border-t border-gray-200 bg-gray-50 flex justify-center">
                      <button
                        onClick={handleRoutingShowMore}
                        disabled={routingLoadingMore}
                        className="px-6 py-2 border border-blue-600 text-blue-600 font-medium rounded-md hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[160px]"
                      >
                        {routingLoadingMore ? (
                          <>
                            <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                            Loading...
                          </>
                        ) : (
                          `Show More (${routingTotal - routingDecisions.length} remaining)`
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* Evaluation Mode Results — Grouped by routing decision */}
                {!evalLoading && evalComparisons.length > 0 && (
                  <EvalModeGroupedResults
                    evalDecisions={evalDecisions}
                    evalComparisons={evalComparisons}
                    evalTotal={evalTotal}
                    evalLoadingMore={evalLoadingMore}
                    onShowMore={handleEvalShowMore}
                    onExportCsv={exportEvalComparisonsCsv}
                  />
                )}

                {/* Empty state for evaluation mode */}
                {!evalLoading && evalComparisons.length === 0 && routingDecisions.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center text-gray-500 text-sm">
                    No evaluation mode results found. Run summarization with routing_mode &quot;evaluation&quot; to see model comparisons here.
                  </div>
                )}

                {/* Empty state for entire routing tab */}
                {routingDecisions.length === 0 && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center text-gray-500 text-sm">
                    No routing data available yet. Routing decisions will appear here when summarization requests use routing mode (auto or evaluation).
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
