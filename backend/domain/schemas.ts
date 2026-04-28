import { z } from "zod"

/**
 * Domain Schemas
 * Canonical Zod schemas for inputs/outputs/entities
 */

// ============================================================================
// Fact Check Schemas
// ============================================================================

export const FactCheckRequestSchema = z.object({
  text: z.string().min(1, "Text is required"),
  debug: z.boolean().optional(),
  website: z.string().optional(), // Website where the action was taken
  model: z.string().optional(),   // Optional model override
})

// Internal schema for LLM structured output (without sources/debug)
export const FactCheckDataSchema = z.object({
  score: z.number().min(0).max(100),
  reason: z.string(),
  verified: z.boolean(),
})

export const FactCheckDebugInfoSchema = z.object({
  selectedText: z.string(),
  tavilySearch: z.object({
    query: z.string(),
    resultsCount: z.number(),
    results: z.array(
      z.object({
        title: z.string(),
        url: z.string(),
        content: z.string(),
        contentLength: z.number(),
        score: z.number(),
      })
    ),
  }).optional(),
  augmentedPrompt: z.string().optional(),
  openaiResponse: z.object({
    raw: z.string(),
    model: z.string(),
    usage: z.any().optional(),
  }).optional(),
})

export const FactCheckResponseSchema = z.object({
  score: z.number().min(0).max(100),
  reason: z.string(),
  sources: z.array(z.string()),
  verified: z.boolean(),
  model: z.string().optional(),       // Model used for this request
  usage: z.object({
    prompt_tokens: z.number().optional(),
    completion_tokens: z.number().optional(),
    total_tokens: z.number().optional(),
  }).optional(), // Token usage for tracking (always present)
  debug: FactCheckDebugInfoSchema.optional(),
})

// ============================================================================
// Summarize Schemas
// ============================================================================

export const FusionConfigSchema = z.object({
  proposerModels: z.array(z.string()).min(2).max(5).optional(),
  aggregatorModel: z.string().optional(),
  timeoutMs: z.number().min(5_000).max(30_000).optional(),
})

export const JudgeRequestSchema = z.object({
  judge_mode: z.enum(["metrics_only", "judge_only", "both"]).optional(),
  judge_model: z.string().min(1).optional(),
  judge_style: z.enum(["rubric", "absolute"]).optional(),
})

export const SummarizeRequestSchema = z.object({
  content: z.string().optional(),
  url: z.string().url().optional(),
  debug: z.boolean().optional(),
  website: z.string().optional(), // Website where the action was taken
  model: z.string().optional(),   // Optional model override
  routing_mode: z.enum(['auto', 'evaluation', 'forced', 'fusion']).optional(), // Routing mode for model selection
  fusion_config: FusionConfigSchema.optional(),
  judge_config: JudgeRequestSchema.optional(),  // Per-request override of stored judge config
}).refine(
  (data) => data.content || data.url,
  {
    message: "Either 'content' or 'url' is required",
    path: ["content", "url"],
  }
)

// Internal schema for LLM structured output
export const SummaryDataSchema = z.object({
  summary: z.string(),
  category: z.string(),
  readingTime: z.number().min(0),
})

// Token usage schema (shared)
const TokenUsageSchema = z.object({
  prompt_tokens: z.number().optional(),
  completion_tokens: z.number().optional(),
  total_tokens: z.number().optional(),
})

export const SummarizeDebugInfoSchema = z.object({
  url: z.string().url().optional(),
  extractedContent: z.object({
    length: z.number(),
    preview: z.string(),
    fullContent: z.string(),
    title: z.string().optional(),
    excerpt: z.string().optional(),
  }).optional(),
  prompt: z.string().optional(),
  openaiResponse: z.object({
    raw: z.string(),
    model: z.string(),
    usage: z.any().optional(),
  }).optional(),
})

const RoutingInfoSchema = z.object({
  selected_model: z.string(),
  complexity: z.string(),
  fallback_used: z.boolean(),
  candidates: z.array(z.object({
    model_name: z.string(),
    summary: z.string(),
    bert_score: z.number().nullable().optional(),
    rouge1: z.number().nullable().optional(),
    prompt_tokens: z.number().nullable().optional(),
    completion_tokens: z.number().nullable().optional(),
    estimated_cost_usd: z.number().nullable().optional(),
    latency_ms: z.number().nullable().optional(),
    selected: z.boolean(),
  })).optional(), // Only present in evaluation mode
})

export const SummarizeResponseSchema = z.object({
  summary: z.string(),
  category: z.string(),
  readingTime: z.number().min(0),
  model: z.string().optional(),       // Model used for this request
  usage: TokenUsageSchema.optional(), // Token usage for tracking (always present)
  routing: RoutingInfoSchema.optional(), // Routing info (auto/evaluation modes)
  // Full MoAFusionResult payload when routing_mode === 'fusion'.
  // Shape is validated at the output-fusion module boundary; using z.any() here
  // avoids cross-module schema coupling for the debug page payload.
  fusion: z.any().optional(),
  debug: SummarizeDebugInfoSchema.optional(),
})

// ============================================================================
// LLM-Judge Schemas
// ============================================================================

export const JudgeModeSchema = z.enum(["metrics_only", "judge_only", "both"])
export const JudgeStyleSchema = z.enum(["rubric", "absolute"])
export const JudgeVerdictSchema = z.enum(["A", "B", "tie"])

export const JudgeRubricScoresSchema = z.object({
  faithfulness: z.number().min(1).max(5),
  coverage: z.number().min(1).max(5),
  fluency: z.number().min(1).max(5),
  conciseness: z.number().min(1).max(5),
  overall: z.number().min(1).max(5),
})

export const JudgeRubricResultSchema = z.object({
  scores: JudgeRubricScoresSchema,
  justification: z.string(),
})

export const JudgeAbsoluteResultSchema = z.object({
  score: z.number().min(1).max(10),
  justification: z.string(),
})

// NOTE: each verdict slot uses a freshly-constructed `z.enum(...)` instead of
// reusing JudgeVerdictSchema. Sharing one Zod node across multiple fields
// causes `zodToJsonSchema` to emit a `$ref`, and OpenAI's strict structured
// output rejects nested $refs. Inlining keeps the JSON schema flat.
export const JudgePairwiseDimensionsSchema = z.object({
  faithfulness: z.enum(["A", "B", "tie"]),
  coverage: z.enum(["A", "B", "tie"]),
  fluency: z.enum(["A", "B", "tie"]),
  conciseness: z.enum(["A", "B", "tie"]),
})

export const JudgePairwiseResultSchema = z.object({
  winner: z.enum(["A", "B", "tie"]),
  per_dimension: JudgePairwiseDimensionsSchema,
  justification: z.string(),
  length_note: z.string(),
})

export const JudgeRankerResultSchema = z.object({
  ranking: z.array(z.string()).min(1),
  justification: z.string(),
})

export const JudgeConfigSchema = z.object({
  judge_mode: JudgeModeSchema.default("metrics_only"),
  default_judge_model: z.string().default("gpt-4o"),
  default_judge_style: JudgeStyleSchema.default("rubric"),
  factuality_enabled: z.boolean().default(false),
  factuality_model: z.string().default("gpt-4o-mini"),
})

// ============================================================================
// Factuality (claim-entailment) Schemas
// ============================================================================

export const FactualityClaimSchema = z.object({
  claim: z.string(),
})

export const FactualityClaimListSchema = z.object({
  claims: z.array(FactualityClaimSchema).min(0).max(20),
})

export const FactualityVerdictSchema = z.enum([
  "entailed",
  "contradicted",
  "not_mentioned",
])

export const FactualityClaimVerdictSchema = z.object({
  claim: z.string(),
  verdict: FactualityVerdictSchema,
  reason: z.string(),
})

export const FactualityVerdictListSchema = z.object({
  verdicts: z.array(FactualityClaimVerdictSchema),
})

export const FactualityProblemSchema = z.object({
  claim: z.string(),
  reason: z.string(),
})

export const FactualityResultSchema = z.object({
  total_claims: z.number().int().min(0),
  entailed_claims: z.number().int().min(0),
  entailed_ratio: z.number().min(0).max(1),
  hallucinations: z.array(FactualityProblemSchema),
  not_mentioned: z.array(FactualityProblemSchema),
})

// ============================================================================
// Human-eval (blind K-way ranking) Schemas — Stage 5 (M-D)
// ============================================================================

// Each candidate summary in a blind-ranking task. `label` is the visible tag
// shown to the rater (A/B/C/...); `hidden_*` fields stay server-side until the
// admin report / CSV export reveals them.
export const HumanEvalSummarySchema = z.object({
  label: z.string().min(1).max(4),
  text: z.string().min(1),
  hidden_model: z.string().optional(),
  hidden_mode: z.string().optional(),
  evaluation_metric_id: z.string().uuid().optional(),
})

export const HumanEvalTaskSchema = z.object({
  id: z.string().uuid(),
  article_url: z.string(),
  article_text: z.string(),
  summaries: z.array(HumanEvalSummarySchema).min(2).max(10),
  notes: z.string().nullable().optional(),
  created_at: z.string().optional(),
})

// Public-facing task (rater view) hides the `hidden_*` fields.
export const HumanEvalTaskPublicSchema = HumanEvalTaskSchema.extend({
  summaries: z.array(
    HumanEvalSummarySchema.pick({ label: true, text: true }),
  ),
})

export const CreateHumanEvalTaskSchema = z.object({
  article_url: z.string().min(1),
  article_text: z.string().min(1),
  summaries: z.array(HumanEvalSummarySchema).min(2).max(10),
  notes: z.string().optional(),
})

export const HumanEvalResponseSchema = z.object({
  task_id: z.string().uuid(),
  rater_id: z.string().min(1).max(200),
  // Best→worst ordering of labels. Must be a permutation of the task's labels.
  ranking: z.array(z.string().min(1).max(4)).min(2).max(10),
  // { label: "one-sentence rationale" }
  rationale: z.record(z.string()),
})

// ============================================================================
// Log Entry Schema
// ============================================================================

export const LogEntrySchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  type: z.string(),
  stage: z.string(),
  data: z.any(),
})

export const LogsResponseSchema = z.object({
  logs: z.array(LogEntrySchema),
})

export const ClearLogsRequestSchema = z.object({
  action: z.literal("clear"),
})

// ============================================================================
// Environment Schema
// ============================================================================

export const EnvSchema = z.object({
  // Required API keys
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  TAVILY_API_KEY: z.string().min(1, "TAVILY_API_KEY is required"),

  // Optional provider API keys (leave blank if not available)
  GEMINI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  HF_API_KEY: z.string().optional(),
  HF_TIMEOUT_MS: z.string().transform((val) => parseInt(val, 10)).pipe(z.number().positive()).default("30000"),

  // Supabase configuration (optional - Supabase not required)
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_DB_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // Public Supabase keys for client-side access (Realtime)
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),

  // Optional AI configuration
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_TEMPERATURE: z.string().transform((val) => {
    const parsed = parseFloat(val)
    if (isNaN(parsed)) return 0.7
    return Math.max(0, Math.min(2, parsed))
  }).pipe(z.number().min(0).max(2)).default("0.7"),

  // Node environment
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Optional: API URL for extension
  PLASMO_PUBLIC_API_URL: z.string().url().optional(),

  // Optional: Admin dev mode bypass
  ADMIN_DEV_MODE: z.string().optional(),

  // CORS Configuration (for production security)
  CHROME_EXTENSION_ID: z.string().optional(),
  FIREFOX_EXTENSION_ID: z.string().optional(),
  ALLOW_LOCALHOST: z.string().optional(),
})

// ============================================================================
// Type Exports (inferred from schemas)
// ============================================================================

export type FactCheckRequest = z.infer<typeof FactCheckRequestSchema>
export type FactCheckResponse = z.infer<typeof FactCheckResponseSchema>
export type FactCheckDebugInfo = z.infer<typeof FactCheckDebugInfoSchema>
export type FactCheckData = z.infer<typeof FactCheckDataSchema>

export type SummarizeRequest = z.infer<typeof SummarizeRequestSchema>
export type SummarizeResponse = z.infer<typeof SummarizeResponseSchema>
export type SummarizeDebugInfo = z.infer<typeof SummarizeDebugInfoSchema>
export type SummaryData = z.infer<typeof SummaryDataSchema>
export type FusionConfig = z.infer<typeof FusionConfigSchema>
export type JudgeRequest = z.infer<typeof JudgeRequestSchema>

export type LogEntry = z.infer<typeof LogEntrySchema>
export type Env = z.infer<typeof EnvSchema>

export type JudgeMode = z.infer<typeof JudgeModeSchema>
export type JudgeStyle = z.infer<typeof JudgeStyleSchema>
export type JudgeVerdict = z.infer<typeof JudgeVerdictSchema>
export type JudgeRubricScores = z.infer<typeof JudgeRubricScoresSchema>
export type JudgeRubricResult = z.infer<typeof JudgeRubricResultSchema>
export type JudgeAbsoluteResult = z.infer<typeof JudgeAbsoluteResultSchema>
export type JudgePairwiseDimensions = z.infer<typeof JudgePairwiseDimensionsSchema>
export type JudgePairwiseResult = z.infer<typeof JudgePairwiseResultSchema>
export type JudgeRankerResult = z.infer<typeof JudgeRankerResultSchema>
export type JudgeConfig = z.infer<typeof JudgeConfigSchema>

export type FactualityVerdict = z.infer<typeof FactualityVerdictSchema>
export type FactualityClaimVerdict = z.infer<typeof FactualityClaimVerdictSchema>
export type FactualityProblem = z.infer<typeof FactualityProblemSchema>
export type FactualityResult = z.infer<typeof FactualityResultSchema>

export type HumanEvalSummary = z.infer<typeof HumanEvalSummarySchema>
export type HumanEvalTask = z.infer<typeof HumanEvalTaskSchema>
export type HumanEvalTaskPublic = z.infer<typeof HumanEvalTaskPublicSchema>
export type CreateHumanEvalTask = z.infer<typeof CreateHumanEvalTaskSchema>
export type HumanEvalResponse = z.infer<typeof HumanEvalResponseSchema>
