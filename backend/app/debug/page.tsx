"use client"

import { useState, useEffect, useCallback } from "react"

interface ModelOption {
  model_name: string
  display_name: string
  provider: string
  model_type: string
  is_active: boolean
}

interface RoutingCandidate {
  model_name: string
  summary: string
  bert_score: number | null
  rouge1: number | null
  prompt_tokens: number | null
  completion_tokens: number | null
  estimated_cost_usd: number | null
  latency_ms: number | null
  selected: boolean
}

interface RoutingInfo {
  selected_model: string
  complexity: string
  fallback_used: boolean
  candidates?: RoutingCandidate[]
}

interface RoutingStats {
  days: number
  total_decisions: number
  model_distribution: Array<{ model: string; count: number; percentage: number }>
  complexity_breakdown: Array<{ complexity: string; count: number; percentage: number }>
  fallback_rates: Array<{ model: string; total: number; fallbacks: number; rate: number }>
  avg_bert_scores: Array<{ model: string; avg_bert_score: number; count: number }>
}

type RoutingMode = "forced" | "auto" | "evaluation" | "fusion"

interface ModelAvailability {
  model_name: string
  display_name: string
  provider: string
  is_available: boolean
  unavailable_reason?: string
  can_be_proposer: boolean
  can_be_aggregator: boolean
}

interface FusionDraft {
  model_name: string
  provider: string
  summary: string
  status: "success" | "failed" | "timeout"
  latency_ms: number
  prompt_tokens: number | null
  completion_tokens: number | null
  estimated_cost_usd: number | null
  error?: string
  scores: {
    rouge1: number | null
    rouge2: number | null
    rougeL: number | null
    bleu: number | null
    bert_score: number | null
    compression_rate: number | null
  }
}

interface FusionResult {
  fused: {
    summary: string
    category: string
    readingTime: number
    scores: FusionDraft["scores"]
  }
  drafts: FusionDraft[]
  aggregator: {
    model_name: string
    provider: string
    latency_ms: number
    prompt_tokens: number | null
    completion_tokens: number | null
    estimated_cost_usd: number | null
  }
  pipeline: {
    total_latency_ms: number
    total_cost_usd: number | null
    total_tokens: number | null
    proposer_count: number
    successful_proposers: number
    failed_proposers: string[]
  }
}

export default function DebugPage() {
  const [summaryUrl, setSummaryUrl] = useState("")
  const [summaryInputType, setSummaryInputType] = useState<"url" | "paragraph">("url")
  const [summaryParagraph, setSummaryParagraph] = useState("")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [summaryResult, setSummaryResult] = useState<any>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)

  const [factCheckText, setFactCheckText] = useState("")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [factCheckResult, setFactCheckResult] = useState<any>(null)
  const [factCheckLoading, setFactCheckLoading] = useState(false)
  const [factCheckError, setFactCheckError] = useState<string | null>(null)

  const [evalOriginalText, setEvalOriginalText] = useState("")
  const [evalSummaryText, setEvalSummaryText] = useState("")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [evalResult, setEvalResult] = useState<any>(null)
  const [evalLoading, setEvalLoading] = useState(false)
  const [evalError, setEvalError] = useState<string | null>(null)

  const [availableModels, setAvailableModels] = useState<ModelOption[]>([])
  const [selectedModel, setSelectedModel] = useState("")  // "" means use active model

  const [routingMode, setRoutingMode] = useState<RoutingMode>("forced")
  const [comparisonExpanded, setComparisonExpanded] = useState(false)

  // Fusion state
  const [fusionAvailability, setFusionAvailability] = useState<ModelAvailability[]>([])
  const [fusionProposers, setFusionProposers] = useState<string[]>([])
  const [fusionAggregator, setFusionAggregator] = useState<string>("")

  // Routing Stats state
  const [routingStatsExpanded, setRoutingStatsExpanded] = useState(false)
  const [routingStats, setRoutingStats] = useState<RoutingStats | null>(null)
  const [routingStatsLoading, setRoutingStatsLoading] = useState(false)
  const [routingStatsError, setRoutingStatsError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.available) {
          setAvailableModels(data.available)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (routingMode !== "fusion" || fusionAvailability.length > 0) return
    fetch("/api/models/availability")
      .then(res => (res.ok ? res.json() : Promise.reject(new Error("fetch failed"))))
      .then((data: ModelAvailability[]) => setFusionAvailability(data))
      .catch(() => setFusionAvailability([]))
  }, [routingMode, fusionAvailability.length])

  // Seed fusion defaults from persisted routing config (if any).
  useEffect(() => {
    fetch("/api/settings/routing")
      .then(res => (res.ok ? res.json() : Promise.reject(new Error("fetch failed"))))
      .then(data => {
        if (data?.fusion_config?.proposerModels) {
          setFusionProposers(data.fusion_config.proposerModels)
        }
        if (data?.fusion_config?.aggregatorModel) {
          setFusionAggregator(data.fusion_config.aggregatorModel)
        }
      })
      .catch(() => {})
  }, [])

  const fetchRoutingStats = useCallback(async () => {
    setRoutingStatsLoading(true)
    setRoutingStatsError(null)
    try {
      const response = await fetch("/api/routing/stats?days=7")
      if (!response.ok) {
        throw new Error("Failed to fetch routing stats")
      }
      const data = await response.json()
      setRoutingStats(data)
    } catch (err) {
      setRoutingStatsError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setRoutingStatsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (routingStatsExpanded && !routingStats && !routingStatsLoading) {
      fetchRoutingStats()
    }
  }, [routingStatsExpanded, routingStats, routingStatsLoading, fetchRoutingStats])

  const handleSummarize = async () => {
    setSummaryLoading(true)
    setSummaryError(null)
    setSummaryResult(null)

    try {
      const body: {
        debug: boolean
        url?: string
        content?: string
        model?: string
        routing_mode?: string
        fusion_config?: { proposerModels?: string[]; aggregatorModel?: string }
      } = { debug: true }
      if (summaryInputType === "url") {
        body.url = summaryUrl
      } else {
        body.content = summaryParagraph
      }
      if (routingMode === "forced" && selectedModel) {
        body.model = selectedModel
      }
      if (routingMode !== "forced") {
        body.routing_mode = routingMode
      }
      if (routingMode === "fusion" && (fusionProposers.length > 0 || fusionAggregator)) {
        body.fusion_config = {
          ...(fusionProposers.length > 0 ? { proposerModels: fusionProposers } : {}),
          ...(fusionAggregator ? { aggregatorModel: fusionAggregator } : {}),
        }
      }

      const response = await fetch("/api/summarize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to summarize")
      }

      const data = await response.json()
      setSummaryResult(data)
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setSummaryLoading(false)
    }
  }

  const handleFactCheck = async () => {
    setFactCheckLoading(true)
    setFactCheckError(null)
    setFactCheckResult(null)

    try {
      const response = await fetch("/api/fact-check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: factCheckText,
          debug: true,
          ...(selectedModel ? { model: selectedModel } : {}),
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to fact-check")
      }

      const data = await response.json()
      setFactCheckResult(data)
    } catch (err) {
      setFactCheckError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setFactCheckLoading(false)
    }
  }

  const handleEvaluate = async () => {
    setEvalLoading(true)
    setEvalError(null)
    setEvalResult(null)

    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          original: evalOriginalText,
          summary: evalSummaryText,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to evaluate metrics")
      }

      const data = await response.json()
      setEvalResult(data)
    } catch (err) {
      setEvalError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setEvalLoading(false)
    }
  }

  const complexityColor = (complexity: string) => {
    switch (complexity) {
      case "short":
        return "bg-green-50 text-green-700"
      case "medium":
        return "bg-yellow-50 text-yellow-700"
      case "long":
        return "bg-red-50 text-red-700"
      default:
        return "bg-gray-50 text-gray-700"
    }
  }

  const formatCost = (cost: number | null) => {
    if (cost === null || cost === 0) return "Free"
    return `$${cost.toFixed(5)}`
  }

  const routing: RoutingInfo | undefined = summaryResult?.routing

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Debug Interface</h1>
        <p className="text-gray-600 mb-8">
          Test and inspect intermediate results for Summary and Fact-Check features
        </p>

        {/* Routing Mode Selector */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Routing Mode</h2>
          <div className="flex items-center gap-6">
            <label className="inline-flex items-center cursor-pointer">
              <input
                type="radio"
                name="routingMode"
                value="forced"
                checked={routingMode === "forced"}
                onChange={() => setRoutingMode("forced")}
                className="mr-2"
              />
              <span className="text-sm">Forced</span>
              <span className="text-xs text-gray-400 ml-1">(use selected model)</span>
            </label>
            <label className="inline-flex items-center cursor-pointer">
              <input
                type="radio"
                name="routingMode"
                value="auto"
                checked={routingMode === "auto"}
                onChange={() => setRoutingMode("auto")}
                className="mr-2"
              />
              <span className="text-sm">Auto</span>
              <span className="text-xs text-gray-400 ml-1">(complexity-based)</span>
            </label>
            <label className="inline-flex items-center cursor-pointer">
              <input
                type="radio"
                name="routingMode"
                value="evaluation"
                checked={routingMode === "evaluation"}
                onChange={() => setRoutingMode("evaluation")}
                className="mr-2"
              />
              <span className="text-sm">Evaluation</span>
              <span className="text-xs text-gray-400 ml-1">(run all, pick best)</span>
            </label>
            <label className="inline-flex items-center cursor-pointer">
              <input
                type="radio"
                name="routingMode"
                value="fusion"
                checked={routingMode === "fusion"}
                onChange={() => setRoutingMode("fusion")}
                className="mr-2"
              />
              <span className="text-sm">Fusion (MoA)</span>
              <span className="text-xs text-gray-400 ml-1">(N proposers → aggregator)</span>
            </label>
          </div>
        </div>

        {/* Model Override Selector — only shown in Forced mode */}
        {routingMode === "forced" && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Model Override (optional)</h2>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full max-w-md border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Use active model (from Settings)</option>
              {["openai", "gemini", "anthropic"].map((provider) => {
                const models = availableModels.filter((m) => m.provider === provider)
                if (models.length === 0) return null
                return (
                  <optgroup key={provider} label={provider === "openai" ? "OpenAI" : provider === "gemini" ? "Google Gemini" : "Anthropic"}>
                    {models.map((m) => (
                      <option key={m.model_name} value={m.model_name}>
                        {m.display_name}{m.model_type === "reasoning" ? " [reasoning]" : ""}{m.is_active ? " (active)" : ""}
                      </option>
                    ))}
                  </optgroup>
                )
              })}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Select a model to override the active model for test requests below.
            </p>
          </div>
        )}

        {/* Fusion Override Panel — only shown in Fusion mode */}
        {routingMode === "fusion" && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Fusion Override (optional)</h2>
            <p className="text-xs text-gray-500 mb-3">
              Leave empty to use the saved Settings config or auto-select.
              Proposers = 2–5 models, aggregator = one structured-output-capable model.
            </p>

            {fusionAvailability.length === 0 ? (
              <div className="text-xs text-gray-400">Loading available models…</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                    Proposers (Layer 1)
                  </label>
                  <div className="space-y-1 max-h-52 overflow-y-auto border border-gray-200 rounded-lg p-2">
                    {fusionAvailability.map(m => {
                      const checked = fusionProposers.includes(m.model_name)
                      const disabled = !m.can_be_proposer
                      return (
                        <label
                          key={`dbg-prop-${m.model_name}`}
                          className={`flex items-start gap-2 p-1 text-xs rounded ${
                            disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-gray-50"
                          }`}
                          title={disabled ? m.unavailable_reason ?? "Not available" : undefined}
                        >
                          <input
                            type="checkbox"
                            disabled={disabled}
                            checked={checked}
                            onChange={e => {
                              setFusionProposers(prev => {
                                if (e.target.checked) {
                                  if (prev.includes(m.model_name) || prev.length >= 5) return prev
                                  return [...prev, m.model_name]
                                }
                                return prev.filter(n => n !== m.model_name)
                              })
                            }}
                            className="mt-0.5"
                          />
                          <span>
                            <span className="font-medium text-gray-900">{m.display_name}</span>
                            <span className="text-gray-400 ml-1">({m.provider})</span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Selected: {fusionProposers.length} / 5
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                    Aggregator (Layer 2)
                  </label>
                  <select
                    value={fusionAggregator}
                    onChange={e => setFusionAggregator(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Auto-select</option>
                    {fusionAvailability
                      .filter(m => m.can_be_aggregator)
                      .map(m => (
                        <option key={`dbg-agg-${m.model_name}`} value={m.model_name}>
                          {m.display_name} ({m.provider})
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Spacing when no override panel is shown */}
        {routingMode === "auto" || routingMode === "evaluation" ? <div className="mb-8" /> : null}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Summary Feature */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Summary Feature
            </h2>

            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-4 mb-3">
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      name="summaryInputType"
                      value="url"
                      checked={summaryInputType === "url"}
                      onChange={() => setSummaryInputType("url")}
                      className="mr-2"
                    />
                    <span className="text-sm">Article URL</span>
                  </label>
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      name="summaryInputType"
                      value="paragraph"
                      checked={summaryInputType === "paragraph"}
                      onChange={() => setSummaryInputType("paragraph")}
                      className="mr-2"
                    />
                    <span className="text-sm">Selected paragraph</span>
                  </label>
                </div>

                {summaryInputType === "url" ? (
                  <>
                    <input
                      type="url"
                      value={summaryUrl}
                      onChange={(e) => setSummaryUrl(e.target.value)}
                      placeholder="https://vnexpress.net/..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      The content will be extracted using Mozilla/Readability
                    </p>
                  </>
                ) : (
                  <>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Selected paragraph</label>
                    <textarea
                      value={summaryParagraph}
                      onChange={(e) => setSummaryParagraph(e.target.value)}
                      placeholder="Paste the selected paragraph here..."
                      className="w-full h-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">The selected paragraph will be summarized directly.</p>
                  </>
                )}
              </div>

              <button
                onClick={handleSummarize}
                disabled={(summaryInputType === "url" ? !summaryUrl.trim() : !summaryParagraph.trim()) || summaryLoading}
                className="w-full px-4 py-2 bg-black text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {summaryLoading ? "Processing..." : "Test Summary"}
              </button>

              {summaryError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">{summaryError}</p>
                </div>
              )}

              {summaryResult && (
                <div className="space-y-4 mt-4">
                  <div className="border-t border-gray-200 pt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                        Final Result
                      </h3>
                      {summaryResult.model && (
                        <span className="px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 text-xs font-medium">
                          Model: {summaryResult.model}
                        </span>
                      )}
                    </div>

                    {/* Routing Result Panel */}
                    {routing && (
                      <div className="mb-4 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${complexityColor(routing.complexity)}`}>
                            Complexity: {routing.complexity}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                            Routed to: {routing.selected_model}
                          </span>
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${routing.fallback_used ? "bg-orange-50 text-orange-700" : "bg-gray-100 text-gray-600"}`}>
                            Fallback: {routing.fallback_used ? "Yes" : "No"}
                          </span>
                        </div>

                        {/* Model Comparison Table (evaluation mode) */}
                        {routing.candidates && routing.candidates.length > 0 && (
                          <div className="border border-gray-200 rounded-lg overflow-hidden">
                            <button
                              onClick={() => setComparisonExpanded(!comparisonExpanded)}
                              className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                            >
                              <span>Model Comparison ({routing.candidates.length} models)</span>
                              <svg
                                className={`w-4 h-4 transition-transform ${comparisonExpanded ? "rotate-180" : ""}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                            {comparisonExpanded && (
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="bg-gray-50 border-t border-gray-200">
                                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Model</th>
                                      <th className="px-3 py-2 text-right font-semibold text-gray-600">BERTScore</th>
                                      <th className="px-3 py-2 text-right font-semibold text-gray-600">ROUGE-1</th>
                                      <th className="px-3 py-2 text-right font-semibold text-gray-600">Latency</th>
                                      <th className="px-3 py-2 text-right font-semibold text-gray-600">Cost</th>
                                      <th className="px-3 py-2 text-center font-semibold text-gray-600">Winner</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {routing.candidates.map((candidate) => (
                                      <tr
                                        key={candidate.model_name}
                                        className={`border-t border-gray-100 ${candidate.selected ? "bg-green-50" : ""}`}
                                      >
                                        <td className="px-3 py-2 font-medium text-gray-900">{candidate.model_name}</td>
                                        <td className="px-3 py-2 text-right text-gray-700">
                                          {candidate.bert_score !== null ? candidate.bert_score.toFixed(4) : "N/A"}
                                        </td>
                                        <td className="px-3 py-2 text-right text-gray-700">
                                          {candidate.rouge1 !== null ? candidate.rouge1.toFixed(4) : "N/A"}
                                        </td>
                                        <td className="px-3 py-2 text-right text-gray-700">
                                          {candidate.latency_ms !== null ? `${candidate.latency_ms}ms` : "N/A"}
                                        </td>
                                        <td className="px-3 py-2 text-right text-gray-700">
                                          {formatCost(candidate.estimated_cost_usd)}
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                          {candidate.selected && (
                                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                              Winner
                                            </span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Fusion (MoA) Pipeline Panel */}
                    {summaryResult.fusion && (() => {
                      const fusion = summaryResult.fusion as FusionResult
                      const drafts = fusion.drafts ?? []
                      const bestDraft = drafts.reduce<FusionDraft | null>((best, d) => {
                        const curr = d.scores.bert_score ?? -Infinity
                        const prev = best?.scores.bert_score ?? -Infinity
                        return curr > prev ? d : best
                      }, null)
                      return (
                        <div className="mb-4 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                              MoA Pipeline
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                              Aggregator: {fusion.aggregator.model_name}
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                              {fusion.pipeline.successful_proposers}/{fusion.pipeline.proposer_count} proposers OK
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                              Latency: {fusion.pipeline.total_latency_ms}ms
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                              Cost: {formatCost(fusion.pipeline.total_cost_usd)}
                            </span>
                          </div>

                          <div className="border border-gray-200 rounded-lg overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-gray-50 border-b border-gray-200">
                                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Model</th>
                                  <th className="px-3 py-2 text-right font-semibold text-gray-600">Status</th>
                                  <th className="px-3 py-2 text-right font-semibold text-gray-600">BERTScore</th>
                                  <th className="px-3 py-2 text-right font-semibold text-gray-600">ROUGE-1</th>
                                  <th className="px-3 py-2 text-right font-semibold text-gray-600">Latency</th>
                                  <th className="px-3 py-2 text-right font-semibold text-gray-600">Cost</th>
                                </tr>
                              </thead>
                              <tbody>
                                {drafts.map(d => (
                                  <tr
                                    key={`draft-${d.model_name}`}
                                    className={`border-t border-gray-100 ${bestDraft?.model_name === d.model_name ? "bg-blue-50/60" : ""}`}
                                  >
                                    <td className="px-3 py-2 font-medium text-gray-900">{d.model_name}</td>
                                    <td className="px-3 py-2 text-right">
                                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                        d.status === "success"
                                          ? "bg-green-50 text-green-700"
                                          : d.status === "timeout"
                                          ? "bg-yellow-50 text-yellow-700"
                                          : "bg-red-50 text-red-700"
                                      }`}>
                                        {d.status}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-right text-gray-700">
                                      {d.scores.bert_score !== null ? d.scores.bert_score.toFixed(4) : "N/A"}
                                    </td>
                                    <td className="px-3 py-2 text-right text-gray-700">
                                      {d.scores.rouge1 !== null ? d.scores.rouge1.toFixed(4) : "N/A"}
                                    </td>
                                    <td className="px-3 py-2 text-right text-gray-700">{d.latency_ms}ms</td>
                                    <td className="px-3 py-2 text-right text-gray-700">{formatCost(d.estimated_cost_usd)}</td>
                                  </tr>
                                ))}
                                <tr className="border-t border-gray-200 bg-indigo-50/80">
                                  <td className="px-3 py-2 font-semibold text-indigo-900">MoA Fused</td>
                                  <td className="px-3 py-2 text-right">
                                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                                      aggregated
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-right font-semibold text-indigo-900">
                                    {fusion.fused.scores.bert_score !== null ? fusion.fused.scores.bert_score.toFixed(4) : "N/A"}
                                  </td>
                                  <td className="px-3 py-2 text-right font-semibold text-indigo-900">
                                    {fusion.fused.scores.rouge1 !== null ? fusion.fused.scores.rouge1.toFixed(4) : "N/A"}
                                  </td>
                                  <td className="px-3 py-2 text-right text-indigo-900">{fusion.aggregator.latency_ms}ms</td>
                                  <td className="px-3 py-2 text-right text-indigo-900">{formatCost(fusion.aggregator.estimated_cost_usd)}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          {fusion.pipeline.failed_proposers.length > 0 && (
                            <div className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg p-2">
                              Failed proposers: {fusion.pipeline.failed_proposers.join(", ")}
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    <div className="space-y-2">
                      <div>
                        <span className="text-xs text-gray-500">Summary:</span>
                        <p className="text-sm text-gray-900 mt-1">
                          {summaryResult.summary}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500">Category:</span>
                        <div className="mt-1">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            {summaryResult.category}
                          </span>
                        </div>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500">Reading Time:</span>
                        <p className="text-sm text-gray-900 mt-1">
                          {summaryResult.readingTime} minutes
                        </p>
                      </div>
                    </div>
                  </div>

                  {summaryResult.debug && (
                    <div className="border-t border-gray-200 pt-4 space-y-4">
                      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                        Debug Information
                      </h3>

                      {/* URL */}
                      {summaryResult.debug.url && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-700 mb-2">
                            1. Article URL
                          </h4>
                          <div className="bg-gray-50 rounded-lg p-3 text-xs">
                            <a
                              href={summaryResult.debug.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline break-all"
                            >
                              {summaryResult.debug.url}
                            </a>
                          </div>
                        </div>
                      )}

                      {/* Extracted Content from Readability */}
                      {summaryResult.debug.extractedContent && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-700 mb-2">
                            {summaryResult.debug.url ? "2. " : "1. "}Content Extracted from Mozilla/Readability
                          </h4>
                          <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-2">
                            {summaryResult.debug.extractedContent.title && (
                              <div className="text-gray-600 mb-2">
                                <span className="font-semibold">Title:</span> {summaryResult.debug.extractedContent.title}
                              </div>
                            )}
                            {summaryResult.debug.extractedContent.excerpt && (
                              <div className="text-gray-600 mb-2">
                                <span className="font-semibold">Excerpt:</span> {summaryResult.debug.extractedContent.excerpt}
                              </div>
                            )}
                            <div className="text-gray-600 mb-2">
                              <span className="font-semibold">Length:</span> {summaryResult.debug.extractedContent.length} characters
                            </div>
                            <div className="text-gray-900 whitespace-pre-wrap max-h-60 overflow-y-auto border-t border-gray-200 pt-2 mt-2 font-mono text-xs">
                              {summaryResult.debug.extractedContent.fullContent ||
                                summaryResult.debug.extractedContent.preview}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Prompt */}
                      {summaryResult.debug.prompt && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-700 mb-2">
                            {summaryResult.debug.url ? "3. " : "2. "}LLM Prompt
                          </h4>
                          <div className="bg-gray-50 rounded-lg p-3 text-xs font-mono whitespace-pre-wrap max-h-60 overflow-y-auto">
                            {summaryResult.debug.prompt}
                          </div>
                        </div>
                      )}

                      {/* OpenAI Response */}
                      {summaryResult.debug.openaiResponse && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-700 mb-2">
                            {summaryResult.debug.url ? "4. " : "3. "}LLM Response
                          </h4>
                          <div className="bg-gray-50 rounded-lg p-3 text-xs font-mono space-y-2">
                            <div className="text-gray-600">
                              Model: {summaryResult.debug.openaiResponse.model}
                            </div>
                            {summaryResult.debug.openaiResponse.usage && (
                              <div className="text-gray-600">
                                Usage: {JSON.stringify(
                                  summaryResult.debug.openaiResponse.usage,
                                  null,
                                  2
                                )}
                              </div>
                            )}
                            <div className="text-gray-900 whitespace-pre-wrap max-h-60 overflow-y-auto border-t border-gray-200 pt-2 mt-2">
                              {summaryResult.debug.openaiResponse.raw}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Fact-Check Feature */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Fact-Check Feature
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Text Selected (to fact-check)
                </label>
                <textarea
                  value={factCheckText}
                  onChange={(e) => setFactCheckText(e.target.value)}
                  placeholder="Enter text to fact-check..."
                  className="w-full h-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                onClick={handleFactCheck}
                disabled={!factCheckText.trim() || factCheckLoading}
                className="w-full px-4 py-2 bg-black text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {factCheckLoading ? "Processing..." : "Test Fact-Check"}
              </button>

              {factCheckError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">{factCheckError}</p>
                </div>
              )}

              {factCheckResult && (
                <div className="space-y-4 mt-4">
                  <div className="border-t border-gray-200 pt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                        Final Result
                      </h3>
                      {factCheckResult.model && (
                        <span className="px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 text-xs font-medium">
                          Model: {factCheckResult.model}
                        </span>
                      )}
                    </div>
                    <div className="space-y-2">
                      <div>
                        <span className="text-xs text-gray-500">Score:</span>
                        <p className="text-sm text-gray-900 mt-1">
                          {factCheckResult.score}/100
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500">Reason:</span>
                        <p className="text-sm text-gray-900 mt-1">
                          {factCheckResult.reason}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500">Verified:</span>
                        <p className="text-sm text-gray-900 mt-1">
                          {factCheckResult.verified ? "Yes" : "No"}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500">Sources:</span>
                        <ul className="list-disc list-inside text-sm text-gray-900 mt-1">
                          {factCheckResult.sources?.map((source: string, i: number) => (
                            <li key={i} className="break-all">{source}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>

                  {factCheckResult.debug && (
                    <div className="border-t border-gray-200 pt-4 space-y-4">
                      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                        Debug Information
                      </h3>

                      {/* Selected Text */}
                      <div>
                        <h4 className="text-xs font-semibold text-gray-700 mb-2">
                          1. Selected Text
                        </h4>
                        <div className="bg-gray-50 rounded-lg p-3 text-sm">
                          {factCheckResult.debug.selectedText}
                        </div>
                      </div>

                      {/* Tavily Search Results */}
                      {factCheckResult.debug.tavilySearch && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-700 mb-2">
                            2. Tavily Retrieval Results
                          </h4>
                          <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-3">
                            <div className="text-gray-600">
                              Query: &ldquo;{factCheckResult.debug.tavilySearch.query}&rdquo;
                            </div>
                            <div className="text-gray-600">
                              Results Found: {factCheckResult.debug.tavilySearch.resultsCount}
                            </div>
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                              {factCheckResult.debug.tavilySearch.results.map(
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                (result: any, i: number) => (
                                  <div
                                    key={i}
                                    className="border border-gray-200 rounded p-2 bg-white"
                                  >
                                    <div className="font-semibold text-gray-900 mb-1">
                                      {result.title}
                                    </div>
                                    <div className="text-gray-600 text-xs mb-1 break-all">
                                      {result.url}
                                    </div>
                                    {result.score && (
                                      <div className="text-gray-500 text-xs mb-1">
                                        Score: {result.score}
                                      </div>
                                    )}
                                    <div className="text-gray-700 text-xs mt-1 line-clamp-3">
                                      {result.content}
                                    </div>
                                    <div className="text-gray-400 text-xs mt-1">
                                      Content Length: {result.contentLength} chars
                                    </div>
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Augmented Prompt */}
                      {factCheckResult.debug.augmentedPrompt && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-700 mb-2">
                            3. Augmented Prompt (with Tavily results)
                          </h4>
                          <div className="bg-gray-50 rounded-lg p-3 text-xs font-mono whitespace-pre-wrap max-h-60 overflow-y-auto">
                            {factCheckResult.debug.augmentedPrompt}
                          </div>
                        </div>
                      )}

                      {/* OpenAI Response */}
                      {factCheckResult.debug.openaiResponse && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-700 mb-2">
                            4. LLM Response
                          </h4>
                          <div className="bg-gray-50 rounded-lg p-3 text-xs font-mono space-y-2">
                            <div className="text-gray-600">
                              Model: {factCheckResult.debug.openaiResponse.model}
                            </div>
                            {factCheckResult.debug.openaiResponse.usage && (
                              <div className="text-gray-600">
                                Usage: {JSON.stringify(
                                  factCheckResult.debug.openaiResponse.usage,
                                  null,
                                  2
                                )}
                              </div>
                            )}
                            <div className="text-gray-900 whitespace-pre-wrap max-h-60 overflow-y-auto border-t border-gray-200 pt-2 mt-2">
                              {factCheckResult.debug.openaiResponse.raw}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Evaluation Metrics Feature */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 lg:col-span-2">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Evaluation Metrics Feature
            </h2>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Original Paragraph
                  </label>
                  <textarea
                    value={evalOriginalText}
                    onChange={(e) => setEvalOriginalText(e.target.value)}
                    placeholder="Enter original text..."
                    className="w-full h-48 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Summarized Paragraph
                  </label>
                  <textarea
                    value={evalSummaryText}
                    onChange={(e) => setEvalSummaryText(e.target.value)}
                    placeholder="Enter summarized text..."
                    className="w-full h-48 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <button
                onClick={handleEvaluate}
                disabled={!evalOriginalText.trim() || !evalSummaryText.trim() || evalLoading}
                className="w-full px-4 py-2 bg-black text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {evalLoading ? "Processing..." : "Calculate Evaluation Metrics"}
              </button>

              {evalError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">{evalError}</p>
                </div>
              )}

              {evalResult && (
                <div className="space-y-4 mt-4">
                  <div className="border-t border-gray-200 pt-4">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                      Calculated Metrics
                    </h3>
                    <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
                      <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 flex flex-col items-center justify-center text-center">
                        <span className="text-xs text-gray-500 uppercase font-medium mb-1">ROUGE-1</span>
                        <span className="text-lg font-bold text-gray-900">{evalResult.rouge1}</span>
                      </div>
                      <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 flex flex-col items-center justify-center text-center">
                        <span className="text-xs text-gray-500 uppercase font-medium mb-1">ROUGE-2</span>
                        <span className="text-lg font-bold text-gray-900">{evalResult.rouge2}</span>
                      </div>
                      <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 flex flex-col items-center justify-center text-center">
                        <span className="text-xs text-gray-500 uppercase font-medium mb-1">ROUGE-L</span>
                        <span className="text-lg font-bold text-gray-900">{evalResult.rougeL}</span>
                      </div>
                      <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 flex flex-col items-center justify-center text-center">
                        <span className="text-xs text-gray-500 uppercase font-medium mb-1">BLEU</span>
                        <span className="text-lg font-bold text-gray-900">{evalResult.bleu}</span>
                      </div>
                      <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 flex flex-col items-center justify-center text-center">
                        <span className="text-xs text-gray-500 uppercase font-medium mb-1">BERTScore</span>
                        <span className="text-lg font-bold text-gray-900">{evalResult.bert_score !== null ? evalResult.bert_score.toFixed(4) : "N/A"}</span>
                      </div>
                      <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 flex flex-col items-center justify-center text-center">
                        <span className="text-xs text-gray-500 uppercase font-medium mb-1">Compression</span>
                        <span className="text-lg font-bold text-gray-900">{evalResult.compression_rate !== null ? `${evalResult.compression_rate}%` : "N/A"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Routing Stats Mini-Dashboard */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 lg:col-span-2">
            <button
              onClick={() => setRoutingStatsExpanded(!routingStatsExpanded)}
              className="w-full flex items-center justify-between"
            >
              <h2 className="text-xl font-semibold text-gray-900">Routing Stats</h2>
              <svg
                className={`w-5 h-5 text-gray-500 transition-transform ${routingStatsExpanded ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {routingStatsExpanded && (
              <div className="mt-4">
                {routingStatsLoading && (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-sm text-gray-500">Loading routing stats...</div>
                  </div>
                )}

                {routingStatsError && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-700">{routingStatsError}</p>
                    <button
                      onClick={fetchRoutingStats}
                      className="mt-2 text-xs text-red-600 underline hover:text-red-800"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {routingStats && !routingStatsLoading && (
                  <div className="space-y-6">
                    <p className="text-xs text-gray-500">
                      Last {routingStats.days} days — {routingStats.total_decisions} total routing decisions
                    </p>

                    {/* Model Distribution */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                        Model Distribution
                      </h3>
                      {routingStats.model_distribution.length === 0 ? (
                        <p className="text-sm text-gray-400">No data available</p>
                      ) : (
                        <div className="space-y-2">
                          {routingStats.model_distribution.map((item) => (
                            <div key={item.model} className="flex items-center gap-3">
                              <span className="text-xs text-gray-700 w-32 truncate font-medium" title={item.model}>
                                {item.model}
                              </span>
                              <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                                <div
                                  className="bg-gray-800 h-full rounded-full transition-all"
                                  style={{ width: `${Math.max(item.percentage, 2)}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-500 w-16 text-right">
                                {item.percentage.toFixed(1)}% ({item.count})
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Complexity Breakdown */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                        Complexity Breakdown
                      </h3>
                      <div className="grid grid-cols-3 gap-4">
                        {["short", "medium", "long"].map((level) => {
                          const item = routingStats.complexity_breakdown.find(
                            (c) => c.complexity === level
                          )
                          const colorMap: Record<string, string> = {
                            short: "bg-green-50 border-green-200 text-green-700",
                            medium: "bg-yellow-50 border-yellow-200 text-yellow-700",
                            long: "bg-red-50 border-red-200 text-red-700",
                          }
                          return (
                            <div
                              key={level}
                              className={`p-4 rounded-lg border text-center ${colorMap[level]}`}
                            >
                              <div className="text-xs font-semibold uppercase mb-1">
                                {level}
                              </div>
                              <div className="text-2xl font-bold">
                                {item ? `${item.percentage.toFixed(1)}%` : "0%"}
                              </div>
                              <div className="text-xs mt-1">
                                {item ? `${item.count} requests` : "0 requests"}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Fallback Rates */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                        Fallback Rate by Model
                      </h3>
                      {routingStats.fallback_rates.length === 0 ? (
                        <p className="text-sm text-gray-400">No data available</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-gray-200">
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">Model</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-600">Total</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-600">Fallbacks</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-600">Rate</th>
                              </tr>
                            </thead>
                            <tbody>
                              {routingStats.fallback_rates.map((item) => (
                                <tr key={item.model} className="border-b border-gray-100">
                                  <td className="px-3 py-2 font-medium text-gray-900">{item.model}</td>
                                  <td className="px-3 py-2 text-right text-gray-700">{item.total}</td>
                                  <td className="px-3 py-2 text-right text-gray-700">{item.fallbacks}</td>
                                  <td className="px-3 py-2 text-right">
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                      item.rate > 0.5
                                        ? "bg-red-50 text-red-700"
                                        : item.rate > 0.2
                                        ? "bg-yellow-50 text-yellow-700"
                                        : "bg-green-50 text-green-700"
                                    }`}>
                                      {(item.rate * 100).toFixed(1)}%
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {!routingStats && !routingStatsLoading && !routingStatsError && (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-sm text-gray-400">No routing stats loaded yet.</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
