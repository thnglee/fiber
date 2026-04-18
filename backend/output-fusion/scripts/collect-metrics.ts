#!/usr/bin/env tsx
/**
 * MoA metrics collection CLI.
 *
 * For each article URL in the input list, this script hits the running
 * backend API in two modes:
 *   1. `forced` for each candidate proposer model (one request per model)
 *   2. `fusion` once, using the full MoA pipeline
 *
 * Results are written to a JSON file plus a human-readable Markdown summary
 * so they can be imported directly into the thesis appendix.
 *
 * Usage:
 *   npx tsx output-fusion/scripts/collect-metrics.ts \
 *     --input output-fusion/scripts/sample-urls.json \
 *     --output ../metrics_reports/results/moa-<date>.json
 *
 * Flags:
 *   --input      Path to a JSON file: { "urls": ["https://...", ...] }
 *                or an array of strings. Defaults to sample-urls.json.
 *   --output     Path for the result JSON (and .md summary). Defaults to
 *                ../metrics_reports/results/moa-<ISO-date>.json
 *   --api        Backend base URL. Default: http://localhost:3000
 *   --models     Comma-separated proposer models (also used as the forced
 *                baselines). Defaults to the MoA defaults.
 *   --aggregator Aggregator model. Default: gpt-4o
 *   --timeout    Per-request timeout in ms. Default: 300000.
 *   --limit      Only process the first N URLs (handy for smoke tests).
 */

import * as fs from "node:fs"
import * as path from "node:path"

// ─── CLI args ───────────────────────────────────────────────────────────────

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

const DEFAULT_INPUT = path.resolve(
  __dirname,
  "sample-urls.json",
)
const DEFAULT_OUTPUT_DIR = path.resolve(
  __dirname,
  "../../../metrics_reports/results",
)

const INPUT_PATH = path.resolve(process.cwd(), getArg("input", DEFAULT_INPUT))
const OUTPUT_PATH = path.resolve(
  process.cwd(),
  getArg(
    "output",
    path.join(
      DEFAULT_OUTPUT_DIR,
      `moa-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
    ),
  ),
)
const SUMMARY_PATH = OUTPUT_PATH.replace(/\.json$/, ".md")

const DEFAULT_PROPOSERS = [
  "gpt-4o-mini",
  "gemini-2.0-flash-001",
  "claude-3-5-haiku-latest",
]
const PROPOSERS = getArg("models", DEFAULT_PROPOSERS.join(","))
  .split(",")
  .map(s => s.trim())
  .filter(Boolean)
const AGGREGATOR = getArg("aggregator", "gpt-4o")
const TIMEOUT_MS = getIntArg("timeout", 300_000)
const LIMIT = getIntArg("limit", 0)

// ─── Types ──────────────────────────────────────────────────────────────────

interface MoAScores {
  rouge1: number | null
  rouge2: number | null
  rougeL: number | null
  bleu: number | null
  bert_score: number | null
  compression_rate: number | null
}

interface ForcedRun {
  mode: "forced"
  model: string
  summary?: string
  category?: string
  latency_ms: number
  prompt_tokens?: number | null
  completion_tokens?: number | null
  estimated_cost_usd?: number | null
  bert_score?: number | null
  rouge1?: number | null
  error?: string
}

interface FusionRun {
  mode: "fusion"
  aggregator_model: string
  proposer_models: string[]
  latency_ms: number
  total_cost_usd?: number | null
  total_tokens?: number | null
  fused_summary?: string
  fused_scores?: MoAScores
  drafts?: Array<{
    model_name: string
    status: string
    latency_ms: number
    scores: MoAScores
    estimated_cost_usd?: number | null
  }>
  error?: string
}

interface ArticleRecord {
  index: number
  url: string
  title?: string
  forced: ForcedRun[]
  fusion: FusionRun
}

// ─── Helpers ────────────────────────────────────────────────────────────────

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
  throw new Error(
    `Input file must be a JSON array of URLs or { "urls": [...] }`,
  )
}

function safeHostname(url: string): string | undefined {
  try {
    return new URL(url).hostname
  } catch {
    return undefined
  }
}

async function runForced(url: string, model: string): Promise<ForcedRun> {
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
          model,
        }),
      },
      TIMEOUT_MS,
    )
    const latency = Date.now() - start
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      return {
        mode: "forced",
        model,
        latency_ms: latency,
        error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
      }
    }
    const data: Record<string, unknown> = await res.json()
    const evalData = (data.evaluation || {}) as Record<string, unknown>
    return {
      mode: "forced",
      model,
      summary: typeof data.summary === "string" ? data.summary : undefined,
      category: typeof data.category === "string" ? data.category : undefined,
      latency_ms: latency,
      prompt_tokens:
        (data.usage as Record<string, unknown> | undefined)?.prompt_tokens as
          | number
          | null
          | undefined ?? null,
      completion_tokens:
        (data.usage as Record<string, unknown> | undefined)?.completion_tokens as
          | number
          | null
          | undefined ?? null,
      estimated_cost_usd:
        (data.estimated_cost_usd as number | null | undefined) ?? null,
      bert_score: (evalData.bert_score as number | null | undefined) ?? null,
      rouge1: (evalData.rouge1 as number | null | undefined) ?? null,
    }
  } catch (err) {
    return {
      mode: "forced",
      model,
      latency_ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function runFusion(url: string): Promise<FusionRun> {
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
          routing_mode: "fusion",
          fusion_config: {
            proposerModels: PROPOSERS,
            aggregatorModel: AGGREGATOR,
          },
        }),
      },
      TIMEOUT_MS,
    )
    const latency = Date.now() - start
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      return {
        mode: "fusion",
        aggregator_model: AGGREGATOR,
        proposer_models: PROPOSERS,
        latency_ms: latency,
        error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
      }
    }
    const data = await res.json()
    const fusion = data?.fusion
    if (!fusion) {
      return {
        mode: "fusion",
        aggregator_model: AGGREGATOR,
        proposer_models: PROPOSERS,
        latency_ms: latency,
        error: "Response missing `fusion` payload",
      }
    }
    return {
      mode: "fusion",
      aggregator_model: fusion.aggregator?.model_name ?? AGGREGATOR,
      proposer_models: PROPOSERS,
      latency_ms: latency,
      total_cost_usd: fusion.pipeline?.total_cost_usd ?? null,
      total_tokens: fusion.pipeline?.total_tokens ?? null,
      fused_summary: fusion.fused?.summary,
      fused_scores: fusion.fused?.scores,
      drafts: (fusion.drafts || []).map((d: Record<string, unknown>) => ({
        model_name: d.model_name as string,
        status: d.status as string,
        latency_ms: (d.latency_ms as number) ?? 0,
        scores: (d.scores as MoAScores) ?? emptyScores(),
        estimated_cost_usd:
          (d.estimated_cost_usd as number | null | undefined) ?? null,
      })),
    }
  } catch (err) {
    return {
      mode: "fusion",
      aggregator_model: AGGREGATOR,
      proposer_models: PROPOSERS,
      latency_ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

function emptyScores(): MoAScores {
  return {
    rouge1: null,
    rouge2: null,
    rougeL: null,
    bleu: null,
    bert_score: null,
    compression_rate: null,
  }
}

function mean(nums: Array<number | null | undefined>): number | null {
  const vals = nums.filter(
    (n): n is number => typeof n === "number" && Number.isFinite(n),
  )
  if (vals.length === 0) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

function fmt(n: number | null | undefined, digits = 3): string {
  if (n == null || Number.isNaN(n)) return "—"
  return n.toFixed(digits)
}

// ─── Report ─────────────────────────────────────────────────────────────────

function buildMarkdownReport(
  records: ArticleRecord[],
  startedAt: string,
  finishedAt: string,
): string {
  const lines: string[] = []
  lines.push("# MoA Metrics Collection Report")
  lines.push("")
  lines.push(`- **Started:** ${startedAt}`)
  lines.push(`- **Finished:** ${finishedAt}`)
  lines.push(`- **API:** ${API_BASE}`)
  lines.push(`- **Articles:** ${records.length}`)
  lines.push(`- **Proposers:** ${PROPOSERS.join(", ")}`)
  lines.push(`- **Aggregator:** ${AGGREGATOR}`)
  lines.push("")

  // Per-model aggregates (forced mode)
  lines.push("## Forced-mode averages (per model)")
  lines.push("")
  lines.push(
    "| Model | Runs | Avg BERTScore | Avg ROUGE-1 | Avg Latency (ms) | Avg Cost (USD) |",
  )
  lines.push("|---|---|---|---|---|---|")
  const forcedByModel = new Map<string, ForcedRun[]>()
  for (const r of records) {
    for (const f of r.forced) {
      if (!forcedByModel.has(f.model)) forcedByModel.set(f.model, [])
      forcedByModel.get(f.model)!.push(f)
    }
  }
  for (const [model, runs] of forcedByModel) {
    const ok = runs.filter(r => !r.error)
    lines.push(
      `| ${model} | ${ok.length}/${runs.length} | ${fmt(
        mean(ok.map(r => r.bert_score)),
        4,
      )} | ${fmt(mean(ok.map(r => r.rouge1)), 4)} | ${fmt(
        mean(ok.map(r => r.latency_ms)),
        0,
      )} | ${fmt(mean(ok.map(r => r.estimated_cost_usd)), 6)} |`,
    )
  }
  lines.push("")

  // Fusion aggregates
  const fusionOk = records.filter(r => !r.fusion.error && r.fusion.fused_scores)
  lines.push("## Fusion-mode averages")
  lines.push("")
  lines.push(
    "| Runs | Avg BERTScore | Avg ROUGE-1 | Avg ROUGE-L | Avg BLEU | Avg Latency (ms) | Avg Cost (USD) |",
  )
  lines.push("|---|---|---|---|---|---|---|")
  lines.push(
    `| ${fusionOk.length}/${records.length} | ${fmt(
      mean(fusionOk.map(r => r.fusion.fused_scores?.bert_score ?? null)),
      4,
    )} | ${fmt(mean(fusionOk.map(r => r.fusion.fused_scores?.rouge1 ?? null)), 4)} | ${fmt(
      mean(fusionOk.map(r => r.fusion.fused_scores?.rougeL ?? null)),
      4,
    )} | ${fmt(mean(fusionOk.map(r => r.fusion.fused_scores?.bleu ?? null)), 4)} | ${fmt(
      mean(fusionOk.map(r => r.fusion.latency_ms)),
      0,
    )} | ${fmt(mean(fusionOk.map(r => r.fusion.total_cost_usd ?? null)), 6)} |`,
  )
  lines.push("")

  // Per-article comparison
  lines.push("## Per-article comparison (fused vs best forced)")
  lines.push("")
  lines.push(
    "| # | Host | Best forced model | Best forced BERT | Fused BERT | Δ |",
  )
  lines.push("|---|---|---|---|---|---|")
  for (const r of records) {
    const host = safeHostname(r.url) || r.url
    const okForced = r.forced.filter(f => !f.error && f.bert_score != null)
    const best = okForced.reduce<ForcedRun | null>((acc, cur) => {
      if (!acc) return cur
      return (cur.bert_score ?? -1) > (acc.bert_score ?? -1) ? cur : acc
    }, null)
    const fusedBert = r.fusion.fused_scores?.bert_score ?? null
    const delta =
      fusedBert != null && best?.bert_score != null
        ? fusedBert - best.bert_score
        : null
    lines.push(
      `| ${r.index} | ${host} | ${best?.model ?? "—"} | ${fmt(
        best?.bert_score ?? null,
        4,
      )} | ${fmt(fusedBert, 4)} | ${delta == null ? "—" : (delta >= 0 ? "+" : "") + delta.toFixed(4)} |`,
    )
  }
  lines.push("")

  const errors = records.flatMap(r =>
    [
      ...r.forced.filter(f => f.error).map(f => `- ${r.url} [${f.model}]: ${f.error}`),
      r.fusion.error ? `- ${r.url} [fusion]: ${r.fusion.error}` : null,
    ].filter(Boolean),
  )
  if (errors.length > 0) {
    lines.push("## Errors")
    lines.push("")
    lines.push(errors.join("\n"))
    lines.push("")
  }

  return lines.join("\n")
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const urlsAll = loadUrls(INPUT_PATH)
  const urls = LIMIT > 0 ? urlsAll.slice(0, LIMIT) : urlsAll
  if (urls.length === 0) {
    console.error("No URLs to process.")
    process.exit(1)
  }

  console.log("=".repeat(70))
  console.log("MoA METRICS COLLECTION")
  console.log("=".repeat(70))
  console.log(`Input:       ${INPUT_PATH}`)
  console.log(`Output:      ${OUTPUT_PATH}`)
  console.log(`Summary:     ${SUMMARY_PATH}`)
  console.log(`API:         ${API_BASE}`)
  console.log(`Articles:    ${urls.length}`)
  console.log(`Proposers:   ${PROPOSERS.join(", ")}`)
  console.log(`Aggregator:  ${AGGREGATOR}`)
  console.log("=".repeat(70))

  const startedAt = new Date().toISOString()
  const records: ArticleRecord[] = []

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]
    const label = `[${i + 1}/${urls.length}]`
    console.log(`${label} ${url}`)

    // Run forced passes sequentially so we don't blow up the upstream rate
    // limits. Could be parallelised if the backend is generous.
    const forcedRuns: ForcedRun[] = []
    for (const model of PROPOSERS) {
      process.stdout.write(`  forced/${model} … `)
      const run = await runForced(url, model)
      if (run.error) {
        console.log(`✗ ${run.error}`)
      } else {
        console.log(
          `✓ ${run.latency_ms}ms · BERT ${fmt(run.bert_score, 4)} · ROUGE-1 ${fmt(
            run.rouge1,
            4,
          )}`,
        )
      }
      forcedRuns.push(run)
    }

    process.stdout.write(`  fusion … `)
    const fusion = await runFusion(url)
    if (fusion.error) {
      console.log(`✗ ${fusion.error}`)
    } else {
      console.log(
        `✓ ${fusion.latency_ms}ms · BERT ${fmt(
          fusion.fused_scores?.bert_score ?? null,
          4,
        )} · cost ${fmt(fusion.total_cost_usd, 6)}`,
      )
    }

    records.push({
      index: i + 1,
      url,
      forced: forcedRuns,
      fusion,
    })
  }

  const finishedAt = new Date().toISOString()

  // Ensure output directories exist
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })
  fs.writeFileSync(
    OUTPUT_PATH,
    JSON.stringify(
      {
        started_at: startedAt,
        finished_at: finishedAt,
        api_base: API_BASE,
        proposers: PROPOSERS,
        aggregator: AGGREGATOR,
        records,
      },
      null,
      2,
    ),
  )

  fs.writeFileSync(SUMMARY_PATH, buildMarkdownReport(records, startedAt, finishedAt))

  console.log("")
  console.log(`Wrote JSON   → ${OUTPUT_PATH}`)
  console.log(`Wrote report → ${SUMMARY_PATH}`)
}

main().catch(err => {
  console.error("FATAL:", err)
  process.exit(1)
})
