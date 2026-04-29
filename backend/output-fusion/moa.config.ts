import { getAllModelConfigs } from "@/services/model-config.service"
import { getEnvVar } from "@/config/env"
import {
  isAffordableModel,
  isAggregatorOnlyModel,
  isVisibleModel,
} from "@/config/model-tiers"
import type { ModelConfig } from "@/domain/types"
import type { MoAConfig, ModelAvailability } from "./moa.types"

export const MOA_DEFAULTS = {
  PROPOSER_TIMEOUT_MS: 15_000,
  MIN_SUCCESSFUL_DRAFTS: 2,
  MAX_PROPOSERS: 5,
  INCLUDE_EVALUATION: true,
} as const

// Three providers, all affordable-tier — keeps Layer 1 cheap.
const AUTO_PROPOSER_PREFERENCE = [
  "gpt-4o-mini",
  "gemini-3-flash-preview",
  "claude-haiku-4-5",
  "gemini-3.1-flash-lite-preview",
  "gemini-flash-latest",
]

// gpt-4o is reserved for the aggregator role only (see model-tiers.ts).
const AUTO_AGGREGATOR_PREFERENCE = [
  "gpt-4o",
]

// Planned-but-not-yet-deployed models that should still show up in the UI so
// reviewers can see the architecture supports them.
const PLACEHOLDER_MODELS: ModelAvailability[] = [
  {
    model_name: "vinai/Vistral-7B-Chat",
    display_name: "Vistral 7B Chat (planned)",
    provider: "huggingface",
    is_available: false,
    unavailable_reason: "Chưa triển khai — đang có kế hoạch tích hợp.",
    can_be_proposer: false,
    can_be_aggregator: false,
  },
]

function hasProviderKey(provider: ModelConfig["provider"]): boolean {
  switch (provider) {
    case "openai":
      return Boolean(getEnvVar("OPENAI_API_KEY"))
    case "gemini":
      return Boolean(getEnvVar("GEMINI_API_KEY"))
    case "anthropic":
      return Boolean(getEnvVar("ANTHROPIC_API_KEY"))
    case "huggingface":
      return Boolean(getEnvVar("HF_API_KEY"))
    default:
      return false
  }
}

function getUnavailableReason(provider: ModelConfig["provider"]): string {
  switch (provider) {
    case "openai":
      return "Cần cấu hình biến môi trường OPENAI_API_KEY."
    case "gemini":
      return "Cần cấu hình biến môi trường GEMINI_API_KEY."
    case "anthropic":
      return "Cần cấu hình biến môi trường ANTHROPIC_API_KEY."
    case "huggingface":
      return "Cần cấu hình biến môi trường HF_API_KEY."
    default:
      return "Nhà cung cấp mô hình không được hỗ trợ."
  }
}

function requiresPhoGPTService(model: ModelConfig): boolean {
  return model.provider === "huggingface" && model.model_name.toLowerCase().includes("phogpt")
}

function evaluateAvailability(model: ModelConfig): {
  is_available: boolean
  unavailable_reason?: string
} {
  if (!hasProviderKey(model.provider)) {
    return { is_available: false, unavailable_reason: getUnavailableReason(model.provider) }
  }

  if (requiresPhoGPTService(model)) {
    const serviceUrl = process.env.PHOGPT_SERVICE_URL
    if (!serviceUrl) {
      return {
        is_available: false,
        unavailable_reason: "Cần cấu hình PHOGPT_SERVICE_URL (ZeroGPU/HF Pro).",
      }
    }
  }

  return { is_available: true }
}

function toAvailability(model: ModelConfig): ModelAvailability {
  const { is_available, unavailable_reason } = evaluateAvailability(model)
  // Aggregator-only tier (e.g. gpt-4o) stays selectable in the aggregator dropdown
  // but is hidden from proposer / evaluation pickers — see backend/config/model-tiers.ts.
  const aggregatorOnly = isAggregatorOnlyModel(model.model_name)
  return {
    model_name: model.model_name,
    display_name: model.display_name,
    provider: model.provider,
    is_available,
    unavailable_reason,
    can_be_proposer: is_available && !aggregatorOnly,
    can_be_aggregator: is_available && model.supports_structured_output,
  }
}

export async function getModelAvailability(): Promise<ModelAvailability[]> {
  const models = await getAllModelConfigs()
  // Drop expensive models entirely so they never appear in any selector.
  const visibleModels = models.filter(m => isVisibleModel(m.model_name))
  const available = visibleModels.map(toAvailability)

  const presentNames = new Set(available.map(m => m.model_name))
  const placeholders = PLACEHOLDER_MODELS.filter(p => !presentNames.has(p.model_name))

  return [...available, ...placeholders]
}

function pickByPreference(
  models: ModelConfig[],
  preferredNames: string[],
  predicate: (m: ModelConfig) => boolean,
  limit: number,
): ModelConfig[] {
  const chosen: ModelConfig[] = []
  for (const name of preferredNames) {
    if (chosen.length >= limit) break
    const match = models.find(m => m.model_name === name && predicate(m))
    if (match && !chosen.includes(match)) chosen.push(match)
  }

  if (chosen.length < limit) {
    for (const model of models) {
      if (chosen.length >= limit) break
      if (!predicate(model)) continue
      if (chosen.includes(model)) continue
      if (chosen.some(c => c.provider === model.provider)) continue
      chosen.push(model)
    }
  }

  if (chosen.length < limit) {
    for (const model of models) {
      if (chosen.length >= limit) break
      if (!predicate(model)) continue
      if (chosen.includes(model)) continue
      chosen.push(model)
    }
  }

  return chosen
}

function isAvailable(model: ModelConfig): boolean {
  return evaluateAvailability(model).is_available
}

function canAggregate(model: ModelConfig): boolean {
  return isAvailable(model) && model.supports_structured_output
}

export interface BuildMoAConfigInput {
  proposerModels?: string[]
  aggregatorModel?: string
  timeoutMs?: number
  minSuccessfulDrafts?: number
  includeEvaluation?: boolean
}

export async function buildMoAConfig(userSelection?: BuildMoAConfigInput): Promise<MoAConfig> {
  const allModels = await getAllModelConfigs()

  // ── Proposers ───────────────────────────────────────────────────────────
  let proposers: ModelConfig[]
  if (userSelection?.proposerModels && userSelection.proposerModels.length > 0) {
    const requested = userSelection.proposerModels
    proposers = requested.map(name => {
      const match = allModels.find(m => m.model_name === name)
      if (!match) {
        throw new Error(`Proposer model "${name}" not found in model_configurations.`)
      }
      if (!isAffordableModel(name)) {
        throw new Error(
          `Proposer model "${name}" is not in the affordable tier — see backend/config/model-tiers.ts.`,
        )
      }
      if (!isAvailable(match)) {
        const { unavailable_reason } = evaluateAvailability(match)
        throw new Error(
          `Proposer model "${name}" is not available: ${unavailable_reason ?? "chưa sẵn sàng"}`,
        )
      }
      return match
    })
  } else {
    proposers = pickByPreference(
      allModels,
      AUTO_PROPOSER_PREFERENCE,
      m => isAvailable(m) && isAffordableModel(m.model_name),
      4,
    )
  }

  if (proposers.length < 2) {
    throw new Error(
      `MoA requires at least 2 proposer models, but only ${proposers.length} available.`,
    )
  }
  if (proposers.length > MOA_DEFAULTS.MAX_PROPOSERS) {
    proposers = proposers.slice(0, MOA_DEFAULTS.MAX_PROPOSERS)
  }

  // ── Aggregator ──────────────────────────────────────────────────────────
  let aggregator: ModelConfig
  if (userSelection?.aggregatorModel) {
    const match = allModels.find(m => m.model_name === userSelection.aggregatorModel)
    if (!match) {
      throw new Error(
        `Aggregator model "${userSelection.aggregatorModel}" not found in model_configurations.`,
      )
    }
    if (!isAvailable(match)) {
      const { unavailable_reason } = evaluateAvailability(match)
      throw new Error(
        `Aggregator model "${userSelection.aggregatorModel}" is not available: ${
          unavailable_reason ?? "chưa sẵn sàng"
        }`,
      )
    }
    if (!match.supports_structured_output) {
      throw new Error(
        `Aggregator model "${userSelection.aggregatorModel}" does not support structured output.`,
      )
    }
    aggregator = match
  } else {
    const [picked] = pickByPreference(allModels, AUTO_AGGREGATOR_PREFERENCE, canAggregate, 1)
    if (!picked) {
      throw new Error("MoA could not find any available aggregator model supporting structured output.")
    }
    aggregator = picked
  }

  // ── Other config fields ────────────────────────────────────────────────
  const proposerTimeoutMs = userSelection?.timeoutMs ?? MOA_DEFAULTS.PROPOSER_TIMEOUT_MS
  if (proposerTimeoutMs < 1_000) {
    throw new Error(`MoA proposer timeout must be >= 1000ms, got ${proposerTimeoutMs}.`)
  }

  const minSuccessfulDrafts = userSelection?.minSuccessfulDrafts ?? MOA_DEFAULTS.MIN_SUCCESSFUL_DRAFTS
  const includeEvaluation = userSelection?.includeEvaluation ?? MOA_DEFAULTS.INCLUDE_EVALUATION

  return {
    proposers,
    aggregator,
    proposerTimeoutMs,
    minSuccessfulDrafts,
    includeEvaluation,
  }
}
