import { EnvSchema, type Env } from "@/domain/schemas"

/**
 * Environment Configuration
 * Validates and exports environment variables using EnvSchema
 */

let validatedEnv: Env | null = null

/**
 * Get validated environment variables
 * Validates process.env once and caches the result
 */
export function getEnv(): Env {
  if (validatedEnv) {
    return validatedEnv
  }

  try {
    validatedEnv = EnvSchema.parse({
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      TAVILY_API_KEY: process.env.TAVILY_API_KEY,
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_DB_URL: process.env.SUPABASE_DB_URL,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      OPENAI_MODEL: process.env.OPENAI_MODEL,
      OPENAI_TEMPERATURE: process.env.OPENAI_TEMPERATURE,
      NODE_ENV: process.env.NODE_ENV,
      PLASMO_PUBLIC_API_URL: process.env.PLASMO_PUBLIC_API_URL,
      ADMIN_DEV_MODE: process.env.ADMIN_DEV_MODE,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    })
    return validatedEnv
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Environment validation failed: ${error.message}`)
    }
    throw new Error("Environment validation failed: Unknown error")
  }
}

/**
 * Get environment variable by key (type-safe)
 */
export function getEnvVar<K extends keyof Env>(key: K): Env[K] {
  return getEnv()[key]
}
