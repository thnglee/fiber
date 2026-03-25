import { logger } from "@/lib/logger"
import { getSupabaseAdmin } from "@/lib/supabase"
import { getEnvVar } from "@/config/env"
import { getAllModelConfigs } from "./model-config.service"
import type { ModelConfig, RoutingDecision } from "@/domain/types"

// ============================================================================
// Types
// ============================================================================

export type ArticleComplexity = 'short' | 'medium' | 'long'
export type RoutingMode = 'auto' | 'evaluation' | 'forced'

interface ComplexityThresholds {
  short: number   // max tokens for 'short'
  medium: number  // max tokens for 'medium'
}

const DEFAULT_THRESHOLDS: ComplexityThresholds = {
  short: 400,
  medium: 1500,
}

// Model names matching `model_configurations.model_name`
const MODEL_VIT5 = 'VietAI/vit5-large-vietnews-summarization'
const MODEL_VISTRAL = 'Viet-Mistral/Vistral-7B-Chat'
const MODEL_GPT4O = 'gpt-4o'

// Fallback chain: ViT5 → Vistral → GPT-4o
const FALLBACK_MAP: Record<string, string | null> = {
  [MODEL_VIT5]: MODEL_VISTRAL,
  [MODEL_VISTRAL]: MODEL_GPT4O,
  [MODEL_GPT4O]: null,
}

// Complexity → preferred model mapping
const COMPLEXITY_MODEL_MAP: Record<ArticleComplexity, string> = {
  short: MODEL_VIT5,
  medium: MODEL_VISTRAL,
  long: MODEL_GPT4O,
}

// ============================================================================
// Token estimation
// ============================================================================

/**
 * Estimate token count from text using the chars/4 approximation.
 * Vietnamese text typically has a higher char-to-token ratio than English,
 * but this simple heuristic is good enough for routing decisions.
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4)
}

// ============================================================================
// Complexity classification
// ============================================================================

export function classifyComplexity(
  text: string,
  thresholds: ComplexityThresholds = DEFAULT_THRESHOLDS
): ArticleComplexity {
  const tokens = estimateTokenCount(text)
  if (tokens <= thresholds.short) return 'short'
  if (tokens <= thresholds.medium) return 'medium'
  return 'long'
}

// ============================================================================
// Available providers (runtime check based on configured API keys)
// ============================================================================

function getAvailableProviders(): Set<string> {
  const providers = new Set<string>()

  // OpenAI is always available (required key)
  providers.add('openai')

  if (getEnvVar('GEMINI_API_KEY')) providers.add('gemini')
  if (getEnvVar('ANTHROPIC_API_KEY')) providers.add('anthropic')
  if (getEnvVar('HF_API_KEY')) providers.add('huggingface')

  return providers
}

/**
 * Check whether a specific model is available at runtime
 * (its provider's API key is configured).
 */
function isModelAvailable(modelName: string, availableProviders: Set<string>): boolean {
  // GPT-4o variants → openai
  if (modelName.startsWith('gpt-')) return availableProviders.has('openai')
  // HuggingFace models
  if (modelName === MODEL_VIT5) return availableProviders.has('huggingface')
  if (modelName === MODEL_VISTRAL) return !!getEnvVar('VISTRAL_SERVICE_URL')
  // Gemini
  if (modelName.startsWith('gemini')) return availableProviders.has('gemini')
  // Anthropic
  if (modelName.startsWith('claude')) return availableProviders.has('anthropic')
  // Unknown model — assume available
  return true
}

// ============================================================================
// Model selection (auto mode)
// ============================================================================

/**
 * Select the best model for a given article based on its complexity.
 * Falls through the fallback chain if the preferred model is unavailable.
 */
export function selectModel(
  text: string,
  availableProviders?: Set<string>,
  thresholds?: ComplexityThresholds,
): { model: string; complexity: ArticleComplexity; fallbackUsed: boolean; fallbackReason?: string } {
  const providers = availableProviders ?? getAvailableProviders()
  const complexity = classifyComplexity(text, thresholds)
  const preferred = COMPLEXITY_MODEL_MAP[complexity]

  if (isModelAvailable(preferred, providers)) {
    return { model: preferred, complexity, fallbackUsed: false }
  }

  // Walk the fallback chain
  let current: string | null = preferred
  while (current) {
    const next: string | null = FALLBACK_MAP[current] ?? null
    if (next && isModelAvailable(next, providers)) {
      logger.addLog('routing', 'fallback', {
        preferred,
        fallbackTo: next,
        reason: `${current} unavailable (provider API key not set)`,
      })
      return {
        model: next,
        complexity,
        fallbackUsed: true,
        fallbackReason: `${preferred} unavailable, fell back to ${next}`,
      }
    }
    current = next
  }

  // Last resort: GPT-4o (OpenAI key is required, so this should always work)
  return {
    model: MODEL_GPT4O,
    complexity,
    fallbackUsed: true,
    fallbackReason: `All preferred models unavailable, defaulting to ${MODEL_GPT4O}`,
  }
}

// ============================================================================
// Fallback helper (for use after a model call fails at runtime)
// ============================================================================

export function getFallbackModel(failedModel: string): string | null {
  return FALLBACK_MAP[failedModel] ?? null
}

// ============================================================================
// Routing mode resolution
// ============================================================================

/**
 * Determine the routing mode for a request.
 *
 * Priority:
 * 1. Explicit `routing_mode` in request body (from API or debug page)
 * 2. Explicit `model` override → forced
 * 3. Default → 'auto' (complexity-based routing per development plan)
 */
export function resolveRoutingMode(request: {
  routing_mode?: RoutingMode
  model?: string
}): RoutingMode {
  if (request.routing_mode) return request.routing_mode
  if (request.model) return 'forced'
  return 'auto'
}

// ============================================================================
// ModelConfig lookup helpers
// ============================================================================

/**
 * Find the ModelConfig row for a given model_name.
 * Returns undefined if not found.
 */
export async function getModelConfigByName(modelName: string): Promise<ModelConfig | undefined> {
  const configs = await getAllModelConfigs()
  return configs.find(c => c.model_name === modelName)
}

/**
 * Get ModelConfigs for all three routing candidate models.
 */
export async function getRoutingCandidateConfigs(): Promise<ModelConfig[]> {
  const configs = await getAllModelConfigs()
  const candidateNames = new Set([MODEL_VIT5, MODEL_VISTRAL, MODEL_GPT4O])
  return configs.filter(c => candidateNames.has(c.model_name))
}

// ============================================================================
// Persistence — save routing decision to DB
// ============================================================================

export async function saveRoutingDecision(decision: Omit<RoutingDecision, 'id' | 'created_at'>): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('routing_decisions')
      .insert(decision)
      .select('id')
      .single()

    if (error) {
      logger.addLog('routing', 'save-error', { error: error.message })
      return null
    }

    return data?.id ?? null
  } catch (err) {
    logger.addLog('routing', 'save-error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

// ============================================================================
// Exported constants (for use in fusion service / settings)
// ============================================================================

export { MODEL_VIT5, MODEL_VISTRAL, MODEL_GPT4O, DEFAULT_THRESHOLDS }
export type { ComplexityThresholds }
