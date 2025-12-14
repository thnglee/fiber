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
  debug: FactCheckDebugInfoSchema.optional(),
})

// ============================================================================
// Summarize Schemas
// ============================================================================

export const SummarizeRequestSchema = z.object({
  content: z.string().optional(),
  url: z.string().url().optional(),
  debug: z.boolean().optional(),
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

export const SummarizeResponseSchema = z.object({
  summary: z.string(),
  category: z.string(),
  readingTime: z.number().min(0),
  debug: SummarizeDebugInfoSchema.optional(),
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
  
  // Supabase configuration (optional - Supabase not required)
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_DB_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

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

export type LogEntry = z.infer<typeof LogEntrySchema>
export type Env = z.infer<typeof EnvSchema>
