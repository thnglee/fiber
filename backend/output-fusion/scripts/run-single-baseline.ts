#!/usr/bin/env tsx
/**
 * run-single-baseline.ts
 *
 * For each URL in the input list, calls the running backend with
 * `routing_mode: "forced", model: "gpt-4o"` so the API persists a single
 * `evaluation_metrics` row tagged `mode='forced', model='gpt-4o'` with the
 * configured judge running automatically.
 *
 * Pairs with `compare-fused-vs-single.ts`, which then runs a pairwise judge
 * (fused vs gpt-4o-alone) on every article that has both summaries in the
 * window. The pair answers the central thesis question: "does fusion add
 * value beyond running the aggregator model alone?"
 *
 * Usage:
 *   cd backend
 *   npx tsx output-fusion/scripts/run-single-baseline.ts \
 *     --input output-fusion/scripts/sample-urls-dataset-50.json
 *
 * Flags:
 *   --input        Path to JSON: { "urls": ["https://...", ...] }
 *   --api          Backend base URL. Default: http://localhost:3000
 *   --model        Model to run forced. Default: gpt-4o
 *   --judge-mode   metrics_only|judge_only|both. Default: both
 *   --judge-style  rubric|absolute. Default: rubric
 *   --judge-model  Default: gpt-4o-mini
 *   --timeout      Per-request timeout in ms. Default: 300000
 *   --limit        Process only the first N URLs (smoke test).
 */

import * as fs from "node:fs"
import * as path from "node:path"

// ─── CLI args ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`)
  if (idx !== -1 && args[idx + 1]) return args[idx + 1]
  return fallback
}
function getIntArg(name: string, fallback: number): number {
  const raw = getArg(name, "")
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

const API_BASE =
  process.env.MOA_API_URL ||
  process.env.API_URL ||
  getArg("api", "http://localhost:3000")

const DEFAULT_INPUT = path.resolve(__dirname, "sample-urls.json")
const INPUT_PATH = path.resolve(process.cwd(), getArg("input", DEFAULT_INPUT))
const MODEL = getArg("model", "gpt-4o")
const JUDGE_MODE = getArg("judge-mode", "both")
const JUDGE_STYLE = getArg("judge-style", "rubric")
const JUDGE_MODEL = getArg("judge-model", "gpt-4o-mini")
const TIMEOUT_MS = getIntArg("timeout", 300_000)
const LIMIT = getIntArg("limit", 0)

const JUDGE_CONFIG_BODY =
  JUDGE_MODE !== "metrics_only"
    ? {
        judge_mode: JUDGE_MODE,
        judge_style: JUDGE_STYLE,
        judge_model: JUDGE_MODEL,
      }
    : null

// ─── Helpers ───────────────────────────────────────────────────────────────

function loadUrls(inputPath: string): string[] {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`)
  }
  const raw = fs.readFileSync(inputPath, "utf-8")
  const parsed = JSON.parse(raw)
  if (Array.isArray(parsed)) return parsed.filter(u => typeof u === "string")
  if (parsed && Array.isArray(parsed.urls)) {
    return parsed.urls.filter((u: unknown) => typeof u === "string")
  }
  throw new Error(`Input must be a JSON array of URLs or { "urls": [...] }`)
}

function safeHostname(url: string): string | undefined {
  try {
    return new URL(url).hostname
  } catch {
    return undefined
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function fmt(n: number | null | undefined, digits = 4): string {
  if (n == null || Number.isNaN(n)) return "—"
  return n.toFixed(digits)
}

interface ForcedRunResult {
  url: string
  ok: boolean
  latency_ms: number
  bert_score?: number | null
  rouge1?: number | null
  cost_usd?: number | null
  error?: string
}

async function runForcedSingle(url: string): Promise<ForcedRunResult> {
  const start = Date.now()
  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/api/summarize`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          website: safeHostname(url),
          routing_mode: "forced",
          model: MODEL,
          ...(JUDGE_CONFIG_BODY ? { judge_config: JUDGE_CONFIG_BODY } : {}),
        }),
      },
      TIMEOUT_MS,
    )
    const latency = Date.now() - start
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      return {
        url,
        ok: false,
        latency_ms: latency,
        error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
      }
    }
    const data: Record<string, unknown> = await res.json()
    const evalData = (data.evaluation || {}) as Record<string, unknown>
    return {
      url,
      ok: true,
      latency_ms: latency,
      bert_score: (evalData.bert_score as number | null | undefined) ?? null,
      rouge1: (evalData.rouge1 as number | null | undefined) ?? null,
      cost_usd: (data.estimated_cost_usd as number | null | undefined) ?? null,
    }
  } catch (err) {
    return {
      url,
      ok: false,
      latency_ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const allUrls = loadUrls(INPUT_PATH)
  const urls = LIMIT > 0 ? allUrls.slice(0, LIMIT) : allUrls

  console.log("=".repeat(70))
  console.log("SINGLE-AGGREGATOR BASELINE")
  console.log("=".repeat(70))
  console.log(`Input:       ${INPUT_PATH}`)
  console.log(`API:         ${API_BASE}`)
  console.log(`Model:       ${MODEL}`)
  console.log(`Articles:    ${urls.length}`)
  console.log(
    `Judge mode:  ${JUDGE_MODE}${JUDGE_CONFIG_BODY ? ` (style=${JUDGE_STYLE}, model=${JUDGE_MODEL})` : ""}`,
  )
  console.log("=".repeat(70))

  const startedAt = new Date().toISOString()
  let okCount = 0
  let failCount = 0
  let totalCost = 0

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]
    process.stdout.write(`[${i + 1}/${urls.length}] ${url} … `)
    const result = await runForcedSingle(url)
    if (result.ok) {
      okCount++
      if (result.cost_usd) totalCost += result.cost_usd
      console.log(
        `✓ ${result.latency_ms}ms · BERT ${fmt(result.bert_score)} · ROUGE-1 ${fmt(
          result.rouge1,
        )} · cost ${fmt(result.cost_usd, 6)}`,
      )
    } else {
      failCount++
      console.log(`✗ ${result.error}`)
    }
  }

  console.log("")
  console.log("=".repeat(70))
  console.log("RESULTS")
  console.log("=".repeat(70))
  console.log(`Started:     ${startedAt}`)
  console.log(`Finished:    ${new Date().toISOString()}`)
  console.log(`Successful:  ${okCount}/${urls.length}`)
  console.log(`Failed:      ${failCount}`)
  console.log(`Total cost:  $${totalCost.toFixed(6)}`)
}

main().catch(err => {
  console.error("FATAL:", err)
  process.exit(1)
})
