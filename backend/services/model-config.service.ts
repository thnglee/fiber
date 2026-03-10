import { getSupabaseAdmin } from '@/lib/supabase'
import { getEnvVar } from '@/config/env'
import type { ModelConfig } from '@/domain/types'

/** Read-only capability columns that cannot be updated via updateModelConfig */
const READONLY_COLUMNS = new Set([
  'id', 'created_at', 'provider', 'model_name', 'display_name', 'model_type',
  'context_window', 'supports_streaming', 'supports_structured_output',
  'supports_temperature', 'input_cost_per_1m', 'output_cost_per_1m',
])

/**
 * Get the currently active model configuration.
 * Falls back to env-based OpenAI defaults if no active row exists.
 */
export async function getActiveModelConfig(): Promise<ModelConfig> {
  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('model_configurations')
    .select('*')
    .eq('is_active', true)
    .single()

  if (error || !data) {
    // Graceful fallback — use environment defaults (OpenAI)
    console.warn('[ModelConfig] No active model found, falling back to env defaults')
    return {
      id: 'env-fallback',
      provider: 'openai',
      model_name: getEnvVar('OPENAI_MODEL'),
      display_name: 'GPT-4o Mini (env fallback)',
      model_type: 'standard',
      is_active: true,
      temperature: getEnvVar('OPENAI_TEMPERATURE'),
      top_p: null,
      top_k: null,
      max_tokens: null,
      min_tokens: null,
      frequency_penalty: null,
      presence_penalty: null,
      seed: null,
      context_window: 128000,
      supports_streaming: true,
      supports_structured_output: true,
      supports_temperature: true,
      input_cost_per_1m: null,
      output_cost_per_1m: null,
    }
  }

  return data as ModelConfig
}

/**
 * Get all model configurations ordered by provider, display_name.
 */
export async function getAllModelConfigs(): Promise<ModelConfig[]> {
  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('model_configurations')
    .select('*')
    .order('provider')
    .order('display_name')

  if (error) {
    console.error('[ModelConfig] Failed to fetch all configs:', error)
    throw new Error(`Failed to fetch model configurations: ${error.message}`)
  }

  return (data || []) as ModelConfig[]
}

/**
 * Set a model as the active model (deactivates all others).
 */
export async function setActiveModel(modelName: string): Promise<void> {
  const supabase = getSupabaseAdmin()

  // Deactivate all models
  const { error: deactivateError } = await supabase
    .from('model_configurations')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('is_active', true)

  if (deactivateError) {
    throw new Error(`Failed to deactivate models: ${deactivateError.message}`)
  }

  // Activate the target model
  const { error: activateError, count } = await supabase
    .from('model_configurations')
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq('model_name', modelName)

  if (activateError) {
    throw new Error(`Failed to activate model "${modelName}": ${activateError.message}`)
  }

  // If no rows were updated, the model doesn't exist
  if (count === 0) {
    throw new Error(`Model "${modelName}" not found`)
  }
}

/**
 * Update tunable parameters for a model configuration.
 * Rejects writes to read-only capability columns.
 */
export async function updateModelConfig(
  modelName: string,
  params: Partial<ModelConfig>
): Promise<ModelConfig> {
  // Strip read-only columns
  const updates: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(params)) {
    if (!READONLY_COLUMNS.has(key)) {
      updates[key] = value
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new Error('No writable parameters provided')
  }

  updates.updated_at = new Date().toISOString()

  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('model_configurations')
    .update(updates)
    .eq('model_name', modelName)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update model "${modelName}": ${error.message}`)
  }

  if (!data) {
    throw new Error(`Model "${modelName}" not found`)
  }

  return data as ModelConfig
}
