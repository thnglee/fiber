"use client"

import { useState, useEffect, useCallback } from "react"

interface ModelConfig {
  id: string
  provider: "openai" | "gemini" | "anthropic" | "huggingface"
  model_name: string
  display_name: string
  model_type: "standard" | "reasoning" | "chat" | "base"
  is_active: boolean
  temperature: number
  top_p: number | null
  top_k: number | null
  max_tokens: number | null
  min_tokens: number | null
  frequency_penalty: number | null
  presence_penalty: number | null
  seed: number | null
  context_window: number
  supports_streaming: boolean
  supports_structured_output: boolean
  supports_temperature: boolean
  input_cost_per_1m: number | null
  output_cost_per_1m: number | null
}

type ProviderKey = "openai" | "gemini" | "anthropic" | "huggingface"

const PROVIDER_LABELS: Record<ProviderKey, string> = {
  openai: "OpenAI",
  gemini: "Google Gemini",
  anthropic: "Anthropic Claude",
  huggingface: "HuggingFace",
}

type RoutingMode = "auto" | "evaluation" | "forced"

interface RoutingConfig {
  routing_mode: RoutingMode
  complexity_thresholds: { short: number; medium: number }
  hf_available: boolean
}

const ROUTING_MODE_INFO: Record<RoutingMode, { label: string; description: string }> = {
  auto: {
    label: "Auto",
    description: "System picks model based on article complexity",
  },
  evaluation: {
    label: "Evaluation",
    description: "Run all models, pick best (slower, for research)",
  },
  forced: {
    label: "Forced",
    description: "Use the currently active model (existing behavior)",
  },
}

const ROUTING_MODELS = [
  { name: "ViT5-large", key: "hf" },
  { name: "PhoGPT-4B-Chat", key: "hf" },
  { name: "GPT-4o", key: "openai" },
] as const

function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`
  return `${(tokens / 1_000).toFixed(0)}K`
}

function formatCost(cost: number | null): string {
  if (cost === null || cost === undefined) return "N/A"
  return `$${cost.toFixed(cost < 0.1 ? 3 : 2)}`
}

export default function SettingsPage() {
  const [models, setModels] = useState<ModelConfig[]>([])
  const [activeModel, setActiveModel] = useState<ModelConfig | null>(null)
  const [selectedModel, setSelectedModel] = useState<ModelConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Parameter form state
  const [temperature, setTemperature] = useState(0.7)
  const [topP, setTopP] = useState<string>("")
  const [topK, setTopK] = useState<string>("")
  const [maxTokens, setMaxTokens] = useState<string>("")
  const [minTokens, setMinTokens] = useState<string>("")
  const [frequencyPenalty, setFrequencyPenalty] = useState<string>("")
  const [presencePenalty, setPresencePenalty] = useState<string>("")
  const [seed, setSeed] = useState<string>("")

  const [saving, setSaving] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Routing config state
  const [routingConfig, setRoutingConfig] = useState<RoutingConfig>({
    routing_mode: "forced",
    complexity_thresholds: { short: 400, medium: 1500 },
    hf_available: false,
  })
  const [routingLoading, setRoutingLoading] = useState(true)
  const [routingSaving, setRoutingSaving] = useState(false)
  const [thresholdsOpen, setThresholdsOpen] = useState(false)
  const [shortThreshold, setShortThreshold] = useState("400")
  const [mediumThreshold, setMediumThreshold] = useState("1500")

  const loadParamsFromModel = useCallback((model: ModelConfig) => {
    setTemperature(model.temperature)
    setTopP(model.top_p !== null ? String(model.top_p) : "")
    setTopK(model.top_k !== null ? String(model.top_k) : "")
    setMaxTokens(model.max_tokens !== null ? String(model.max_tokens) : "")
    setMinTokens(model.min_tokens !== null ? String(model.min_tokens) : "")
    setFrequencyPenalty(model.frequency_penalty !== null ? String(model.frequency_penalty) : "")
    setPresencePenalty(model.presence_penalty !== null ? String(model.presence_penalty) : "")
    setSeed(model.seed !== null ? String(model.seed) : "")
  }, [])

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings")
      if (!res.ok) throw new Error("Failed to fetch settings")
      const data = await res.json()
      setModels(data.available)
      setActiveModel(data.active)

      // Select the active model by default
      const active = data.available.find((m: ModelConfig) => m.is_active) || data.active
      setSelectedModel(active)
      loadParamsFromModel(active)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }, [loadParamsFromModel])

  const fetchRoutingConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/routing")
      if (!res.ok) throw new Error("Failed to fetch routing config")
      const data: RoutingConfig = await res.json()
      setRoutingConfig(data)
      setShortThreshold(String(data.complexity_thresholds.short))
      setMediumThreshold(String(data.complexity_thresholds.medium))
    } catch {
      // Use defaults on error
    } finally {
      setRoutingLoading(false)
    }
  }, [])

  const handleSaveRoutingConfig = async (updates: Partial<Pick<RoutingConfig, "routing_mode" | "complexity_thresholds">>) => {
    setRoutingSaving(true)
    setSaveSuccess(null)
    setSaveError(null)

    try {
      const res = await fetch("/api/settings/routing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to save routing config")
      }

      const data: RoutingConfig = await res.json()
      setRoutingConfig(data)
      setSaveSuccess("Routing configuration saved")
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save routing config")
    } finally {
      setRoutingSaving(false)
    }
  }

  useEffect(() => {
    fetchSettings()
    fetchRoutingConfig()
  }, [fetchSettings, fetchRoutingConfig])

  const handleSelectModel = (model: ModelConfig) => {
    setSelectedModel(model)
    loadParamsFromModel(model)
    setSaveSuccess(null)
    setSaveError(null)
  }

  const handleSetActive = async () => {
    if (!selectedModel) return
    setSwitching(true)
    setSaveSuccess(null)
    setSaveError(null)

    try {
      const res = await fetch("/api/settings/active", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: selectedModel.model_name }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to switch model")
      }

      const data = await res.json()
      setActiveModel(data.active)
      // Update local model list
      setModels(prev =>
        prev.map(m => ({
          ...m,
          is_active: m.model_name === selectedModel.model_name,
        }))
      )
      setSaveSuccess(`Switched active model to ${selectedModel.display_name}`)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to switch model")
    } finally {
      setSwitching(false)
    }
  }

  const handleSaveParams = async () => {
    if (!selectedModel) return
    setSaving(true)
    setSaveSuccess(null)
    setSaveError(null)

    try {
      const body: Record<string, unknown> = {
        model: selectedModel.model_name,
        temperature,
      }
      if (topP !== "") body.top_p = parseFloat(topP)
      else body.top_p = null
      if (topK !== "") body.top_k = parseInt(topK, 10)
      else body.top_k = null
      if (maxTokens !== "") body.max_tokens = parseInt(maxTokens, 10)
      else body.max_tokens = null
      if (minTokens !== "") body.min_tokens = parseInt(minTokens, 10)
      else body.min_tokens = null
      if (frequencyPenalty !== "") body.frequency_penalty = parseFloat(frequencyPenalty)
      else body.frequency_penalty = null
      if (presencePenalty !== "") body.presence_penalty = parseFloat(presencePenalty)
      else body.presence_penalty = null
      if (seed !== "") body.seed = parseInt(seed, 10)
      else body.seed = null

      const res = await fetch("/api/settings/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to save parameters")
      }

      const data = await res.json()
      // Update local model list with saved config
      setModels(prev =>
        prev.map(m => (m.model_name === selectedModel.model_name ? data.config : m))
      )
      setSelectedModel(data.config)
      if (activeModel?.model_name === selectedModel.model_name) {
        setActiveModel(data.config)
      }
      setSaveSuccess("Parameters saved successfully")
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save parameters")
    } finally {
      setSaving(false)
    }
  }

  // Group models by provider
  const grouped = models.reduce<Record<ProviderKey, ModelConfig[]>>(
    (acc, m) => {
      acc[m.provider] = acc[m.provider] || []
      acc[m.provider].push(m)
      return acc
    },
    { openai: [], gemini: [], anthropic: [], huggingface: [] }
  )

  const isReasoning = selectedModel?.model_type === "reasoning"
  const isSelectedActive = selectedModel?.model_name === activeModel?.model_name

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-48" />
            <div className="h-4 bg-gray-200 rounded w-80" />
            <div className="h-64 bg-gray-200 rounded-xl" />
            <div className="h-48 bg-gray-200 rounded-xl" />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="p-6 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Model Settings</h1>
        <p className="text-gray-600 mb-8">
          Configure the active LLM provider and model
        </p>

        {/* Feedback messages */}
        {saveSuccess && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-700">{saveSuccess}</p>
          </div>
        )}
        {saveError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{saveError}</p>
          </div>
        )}

        {/* Section 1 — Provider & Model Selection */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Provider & Model Selection
          </h2>

          <div className="space-y-4">
            {(["openai", "gemini", "anthropic", "huggingface"] as ProviderKey[]).map(provider => {
              const providerModels = grouped[provider]
              if (!providerModels || providerModels.length === 0) return null

              return (
                <div key={provider} className="border border-gray-200 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">
                    {PROVIDER_LABELS[provider]}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {providerModels.map(model => {
                      const isSelected = selectedModel?.model_name === model.model_name
                      const isActive = model.is_active

                      return (
                        <button
                          key={model.model_name}
                          onClick={() => handleSelectModel(model)}
                          className={`relative px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                            isSelected
                              ? "border-black bg-gray-50 ring-1 ring-black"
                              : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span>{model.display_name}</span>
                            {model.model_type === "reasoning" && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">
                                reasoning
                              </span>
                            )}
                            {isActive && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-700">
                                active
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                            <span>{formatContextWindow(model.context_window)}</span>
                            <span className="text-gray-300">|</span>
                            <span>
                              {formatCost(model.input_cost_per_1m)} / {formatCost(model.output_cost_per_1m)} per 1M
                            </span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Set Active button */}
          {selectedModel && !isSelectedActive && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <button
                onClick={handleSetActive}
                disabled={switching}
                className="px-4 py-2 bg-black text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {switching
                  ? "Switching..."
                  : `Set ${selectedModel.display_name} as Active`}
              </button>
            </div>
          )}
        </div>

        {/* Section — Routing Configuration */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Routing Configuration
          </h2>

          {routingLoading ? (
            <div className="animate-pulse space-y-3">
              <div className="h-4 bg-gray-200 rounded w-48" />
              <div className="h-10 bg-gray-200 rounded" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Routing Mode */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Routing Mode
                </label>
                <div className="space-y-2">
                  {(["auto", "evaluation", "forced"] as RoutingMode[]).map(mode => (
                    <label
                      key={mode}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        routingConfig.routing_mode === mode
                          ? "border-black bg-gray-50 ring-1 ring-black"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="routing_mode"
                        value={mode}
                        checked={routingConfig.routing_mode === mode}
                        onChange={() => handleSaveRoutingConfig({ routing_mode: mode })}
                        disabled={routingSaving}
                        className="mt-0.5"
                      />
                      <div>
                        <span className="text-sm font-medium text-gray-900">
                          {ROUTING_MODE_INFO[mode].label}
                        </span>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {ROUTING_MODE_INFO[mode].description}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Complexity Thresholds — collapsible */}
              <div className="border border-gray-200 rounded-lg">
                <button
                  type="button"
                  onClick={() => setThresholdsOpen(!thresholdsOpen)}
                  className="w-full flex items-center justify-between p-4 text-left"
                >
                  <span className="text-sm font-medium text-gray-700">
                    Complexity Thresholds
                  </span>
                  <svg
                    className={`w-4 h-4 text-gray-500 transition-transform ${thresholdsOpen ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {thresholdsOpen && (
                  <div className="px-4 pb-4 space-y-4 border-t border-gray-200 pt-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Short article max tokens
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={shortThreshold}
                        onChange={e => setShortThreshold(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        Articles with token count at or below this use ViT5 (default: 400)
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Medium article max tokens
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={mediumThreshold}
                        onChange={e => setMediumThreshold(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        Articles with token count at or below this use PhoGPT; above uses GPT-4o (default: 1500)
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        const s = parseInt(shortThreshold, 10)
                        const m = parseInt(mediumThreshold, 10)
                        if (isNaN(s) || isNaN(m) || s <= 0 || m <= 0) return
                        if (s >= m) {
                          setSaveError("Short threshold must be less than medium threshold")
                          return
                        }
                        handleSaveRoutingConfig({ complexity_thresholds: { short: s, medium: m } })
                      }}
                      disabled={routingSaving}
                      className="px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {routingSaving ? "Saving..." : "Save Thresholds"}
                    </button>
                  </div>
                )}
              </div>

              {/* Available Models for Routing */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Available Models for Routing
                </label>
                <div className="space-y-2">
                  {ROUTING_MODELS.map(model => {
                    const isAvailable = model.key === "openai" ? true : routingConfig.hf_available

                    return (
                      <div
                        key={model.name}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100"
                      >
                        <span className="text-sm font-medium text-gray-900">{model.name}</span>
                        {isAvailable ? (
                          <span className="flex items-center gap-1.5 text-sm text-green-600">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Available
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-sm text-gray-400">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            Unavailable (HF_API_KEY not set)
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Section 2 — Model Parameters */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-1">
              Model Parameters
            </h2>
            {selectedModel && (
              <p className="text-sm text-gray-500 mb-4">
                Editing parameters for <span className="font-medium text-gray-700">{selectedModel.display_name}</span>
              </p>
            )}

            {selectedModel && (
              <div className="space-y-4">
                {/* Temperature */}
                {!isReasoning && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Temperature
                      {selectedModel.provider === "anthropic" && (
                        <span className="ml-2 text-xs text-gray-400">0–1 for Anthropic</span>
                      )}
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max={selectedModel.provider === "anthropic" ? "1" : "2"}
                        step="0.1"
                        value={temperature}
                        onChange={e => setTemperature(parseFloat(e.target.value))}
                        className="flex-1"
                      />
                      <span className="text-sm font-mono text-gray-700 w-10 text-right">
                        {temperature.toFixed(1)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Top-P */}
                {!isReasoning && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Top-P <span className="text-xs text-gray-400">(0–1, optional)</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.05"
                      value={topP}
                      onChange={e => setTopP(e.target.value)}
                      placeholder="Not set"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}

                {/* Top-K */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Top-K <span className="text-xs text-gray-400">(integer, optional)</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={topK}
                    onChange={e => setTopK(e.target.value)}
                    placeholder="Not set"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">Forwarded to Gemini/Anthropic only</p>
                </div>

                {/* Max Tokens */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Tokens <span className="text-xs text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={maxTokens}
                    onChange={e => setMaxTokens(e.target.value)}
                    placeholder="Not set"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Min Tokens */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Min Tokens <span className="text-xs text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={minTokens}
                    onChange={e => setMinTokens(e.target.value)}
                    placeholder="Not set"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">Stored only, not forwarded to any provider</p>
                </div>

                {/* Frequency Penalty — OpenAI standard only */}
                {selectedModel.provider === "openai" && !isReasoning && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Frequency Penalty <span className="text-xs text-gray-400">(-2 to 2)</span>
                    </label>
                    <input
                      type="number"
                      min="-2"
                      max="2"
                      step="0.1"
                      value={frequencyPenalty}
                      onChange={e => setFrequencyPenalty(e.target.value)}
                      placeholder="Not set"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">OpenAI standard models only</p>
                  </div>
                )}

                {/* Presence Penalty — OpenAI standard only */}
                {selectedModel.provider === "openai" && !isReasoning && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Presence Penalty <span className="text-xs text-gray-400">(-2 to 2)</span>
                    </label>
                    <input
                      type="number"
                      min="-2"
                      max="2"
                      step="0.1"
                      value={presencePenalty}
                      onChange={e => setPresencePenalty(e.target.value)}
                      placeholder="Not set"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">OpenAI standard models only</p>
                  </div>
                )}

                {/* Seed */}
                {selectedModel.provider !== "anthropic" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Seed <span className="text-xs text-gray-400">(integer, optional)</span>
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={seed}
                      onChange={e => setSeed(e.target.value)}
                      placeholder="Not set"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">For reproducible outputs; not supported by Anthropic</p>
                  </div>
                )}

                {/* Reasoning model notice */}
                {isReasoning && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs text-amber-700">
                      Reasoning models do not support temperature, top_p, frequency_penalty, or presence_penalty. These parameters are hidden.
                    </p>
                  </div>
                )}

                {/* Save button */}
                <button
                  onClick={handleSaveParams}
                  disabled={saving}
                  className="w-full px-4 py-2 bg-black text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? "Saving..." : "Save Parameters"}
                </button>
              </div>
            )}
          </div>

          {/* Section 3 — Model Info (read-only) */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Model Info
            </h2>

            {selectedModel && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <span className="text-xs text-gray-500 block mb-1">Provider</span>
                    <span className="text-sm font-medium text-gray-900">
                      {PROVIDER_LABELS[selectedModel.provider]}
                    </span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <span className="text-xs text-gray-500 block mb-1">Model Name</span>
                    <span className="text-sm font-medium text-gray-900 font-mono">
                      {selectedModel.model_name}
                    </span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <span className="text-xs text-gray-500 block mb-1">Model Type</span>
                    <span className="text-sm font-medium text-gray-900 capitalize">
                      {selectedModel.model_type}
                    </span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <span className="text-xs text-gray-500 block mb-1">Context Window</span>
                    <span className="text-sm font-medium text-gray-900">
                      {formatContextWindow(selectedModel.context_window)} tokens
                    </span>
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    Capabilities
                  </h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Streaming</span>
                      <span className={`text-sm font-medium ${selectedModel.supports_streaming ? "text-green-600" : "text-red-500"}`}>
                        {selectedModel.supports_streaming ? "Supported" : "Not supported"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Structured Output</span>
                      <span className={`text-sm font-medium ${selectedModel.supports_structured_output ? "text-green-600" : "text-red-500"}`}>
                        {selectedModel.supports_structured_output ? "Supported" : "Not supported"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Temperature Control</span>
                      <span className={`text-sm font-medium ${selectedModel.supports_temperature ? "text-green-600" : "text-red-500"}`}>
                        {selectedModel.supports_temperature ? "Supported" : "Not supported"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    Pricing
                  </h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Input cost</span>
                      <span className="text-sm font-medium text-gray-900">
                        {formatCost(selectedModel.input_cost_per_1m)} / 1M tokens
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Output cost</span>
                      <span className="text-sm font-medium text-gray-900">
                        {formatCost(selectedModel.output_cost_per_1m)} / 1M tokens
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
