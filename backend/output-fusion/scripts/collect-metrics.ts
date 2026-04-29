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
 *   --input        Path to a JSON file: { "urls": ["https://...", ...] }
 *                  or an array of strings. Defaults to sample-urls.json.
 *   --output       Path for the result JSON (and .md summary). Defaults to
 *                  ../metrics_reports/results/moa-<ISO-date>.json
 *   --api          Backend base URL. Default: http://localhost:3000
 *   --models       Comma-separated proposer models (also used as the forced
 *                  baselines). Defaults to the MoA defaults.
 *   --aggregator   Aggregator model. Default: gpt-4o
 *   --timeout      Per-request timeout in ms. Default: 300000.
 *   --limit        Only process the first N URLs (handy for smoke tests).
 *   --stats-only   Path to an existing batch JSON. Computes & writes a
 *                  `statistics` block + "Statistical Significance" Markdown
 *                  section without making any API calls. Also back-fills the
 *                  "LLM-Judge Pairwise" section if the JSON has verdicts.
 *   --judge-mode   metrics_only|judge_only|both. Default metrics_only.
 *                  When != metrics_only, judge_config is sent on every
 *                  /api/summarize call and the judge_pairwise verdict is
 *                  captured for fusion runs.
 *   --judge-style  rubric|absolute. Default rubric. Per-summary judge style.
 *   --judge-model  Default gpt-4o. Any model with structured-output support.
 */

import * as fs from "node:fs"
import * as path from "node:path"

import {
  pairedMetricStats,
  signTestPValue,
  type PairedMetricStats,
} from "./stats"

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
  "gemini-2.5-flash",
  "claude-haiku-4-5",
]
const PROPOSERS = getArg("models", DEFAULT_PROPOSERS.join(","))
  .split(",")
  .map(s => s.trim())
  .filter(Boolean)
const AGGREGATOR = getArg("aggregator", "gpt-4o")
const TIMEOUT_MS = getIntArg("timeout", 300_000)
const LIMIT = getIntArg("limit", 0)
const SKIP_FORCED = args.includes("--skip-forced")
const STATS_ONLY = getArg("stats-only", "")

// ─── Judge config (additive — backwards-compatible CLI flags) ──────────────

type JudgeMode = "metrics_only" | "judge_only" | "both"
type JudgeStyle = "rubric" | "absolute"

const JUDGE_MODE = (() => {
  const raw = getArg("judge-mode", "metrics_only")
  if (raw === "metrics_only" || raw === "judge_only" || raw === "both") return raw
  console.error(`Invalid --judge-mode: ${raw} (expected metrics_only|judge_only|both)`)
  process.exit(1)
})() as JudgeMode
const JUDGE_STYLE = (() => {
  const raw = getArg("judge-style", "rubric")
  if (raw === "rubric" || raw === "absolute") return raw
  console.error(`Invalid --judge-style: ${raw} (expected rubric|absolute)`)
  process.exit(1)
})() as JudgeStyle
const JUDGE_MODEL = getArg("judge-model", "gpt-4o-mini")
const JUDGE_ENABLED = JUDGE_MODE !== "metrics_only"

const JUDGE_CONFIG_BODY = JUDGE_ENABLED
  ? { judge_mode: JUDGE_MODE, judge_style: JUDGE_STYLE, judge_model: JUDGE_MODEL }
  : null

// ─── Types ──────────────────────────────────────────────────────────────────

interface MoAScores {
  rouge1: number | null
  rouge2: number | null
  rougeL: number | null
  bleu: number | null
  bert_score: number | null
  compression_rate: number | null
}

interface JudgeRubricBlock {
  faithfulness?: number | null
  coverage?: number | null
  fluency?: number | null
  conciseness?: number | null
  overall?: number | null
}

interface JudgeForcedBlock {
  mode: JudgeMode
  style: JudgeStyle
  model: string
  rubric?: JudgeRubricBlock | null
  absolute?: number | null
  justification?: string | null
  cost_usd?: number | null
  latency_ms?: number | null
}

interface JudgePairwiseBlock {
  winner: "A" | "B" | "tie" | string
  winner_label?: string | null
  summary_a_label: string
  summary_b_label: string
  per_dimension: Record<string, string>
  justification?: string | null
  length_note?: string | null
  judge_model: string
  cost_usd?: number | null
  latency_ms?: number | null
  position_swapped?: boolean | null
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
  judge?: JudgeForcedBlock | null
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
  judge_pairwise?: JudgePairwiseBlock | null
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
          ...(JUDGE_CONFIG_BODY ? { judge_config: JUDGE_CONFIG_BODY } : {}),
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
          ...(JUDGE_CONFIG_BODY ? { judge_config: JUDGE_CONFIG_BODY } : {}),
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
    const judgePairwise = fusion.judge_pairwise as
      | Record<string, unknown>
      | null
      | undefined
    const judge_pairwise: JudgePairwiseBlock | null = judgePairwise
      ? {
          winner: judgePairwise.winner as string,
          winner_label: (judgePairwise.winner_label as string | null) ?? null,
          summary_a_label:
            (judgePairwise.summary_a_label as string) ?? "fused",
          summary_b_label:
            (judgePairwise.summary_b_label as string) ?? "best_draft",
          per_dimension:
            (judgePairwise.per_dimension as Record<string, string>) ?? {},
          justification:
            (judgePairwise.justification as string | null) ?? null,
          length_note: (judgePairwise.length_note as string | null) ?? null,
          judge_model:
            (judgePairwise.judge_model as string) ?? JUDGE_MODEL,
          cost_usd:
            (judgePairwise.cost_usd as number | null | undefined) ?? null,
          latency_ms:
            (judgePairwise.latency_ms as number | null | undefined) ?? null,
          position_swapped:
            (judgePairwise.position_swapped as boolean | null | undefined) ?? null,
        }
      : null

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
      judge_pairwise,
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

// ─── Statistics (paired sign-test fused vs best-draft) ────────────────────

type OverlapMetric = "bert_score" | "rouge1" | "rouge2" | "rougeL" | "bleu"

const OVERLAP_METRICS: OverlapMetric[] = [
  "bert_score",
  "rouge1",
  "rouge2",
  "rougeL",
  "bleu",
]

interface StatisticsBlock {
  per_metric: Partial<Record<OverlapMetric, PairedMetricStats>>
  pairwise_judge?: {
    n: number
    wins_fused: number
    wins_best: number
    ties: number
    sign_test_p: number
  }
}

function pickFusedValue(
  fusion: FusionRun,
  metric: OverlapMetric,
): number | null {
  const v = fusion.fused_scores?.[metric]
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

function pickBestDraftValue(
  fusion: FusionRun,
  metric: OverlapMetric,
): number | null {
  const drafts = (fusion.drafts ?? []).filter(d => d.status === "success")
  let best: number | null = null
  for (const d of drafts) {
    const v = d.scores?.[metric]
    if (typeof v === "number" && Number.isFinite(v)) {
      if (best === null || v > best) best = v
    }
  }
  return best
}

function computeStatistics(records: ArticleRecord[]): StatisticsBlock {
  const fusionRecords = records.filter(
    r => !r.fusion.error && r.fusion.fused_scores,
  )

  const per_metric: StatisticsBlock["per_metric"] = {}
  for (const metric of OVERLAP_METRICS) {
    const fused = fusionRecords.map(r => pickFusedValue(r.fusion, metric))
    const best = fusionRecords.map(r => pickBestDraftValue(r.fusion, metric))
    per_metric[metric] = pairedMetricStats(fused, best)
  }

  // Pairwise-judge stats: one row per fusion record that produced a verdict.
  const pairwiseRecords = records.filter(
    r => r.fusion.judge_pairwise && typeof r.fusion.judge_pairwise.winner === "string",
  )
  let pairwise_judge: StatisticsBlock["pairwise_judge"] | undefined
  if (pairwiseRecords.length > 0) {
    let wins_fused = 0
    let wins_best = 0
    let ties = 0
    for (const r of pairwiseRecords) {
      const verdict = r.fusion.judge_pairwise!
      const winnerLabel =
        verdict.winner_label ??
        (verdict.winner === "A"
          ? verdict.summary_a_label
          : verdict.winner === "B"
            ? verdict.summary_b_label
            : null)
      if (verdict.winner === "tie") ties++
      else if (winnerLabel === "fused") wins_fused++
      else wins_best++
    }
    pairwise_judge = {
      n: pairwiseRecords.length,
      wins_fused,
      wins_best,
      ties,
      sign_test_p: signTestPValue(wins_fused, wins_fused + wins_best),
    }
  }

  return { per_metric, ...(pairwise_judge ? { pairwise_judge } : {}) }
}

const METRIC_LABELS: Record<OverlapMetric, string> = {
  bert_score: "BERT",
  rouge1: "ROUGE-1",
  rouge2: "ROUGE-2",
  rougeL: "ROUGE-L",
  bleu: "BLEU",
}

function verdict(s: PairedMetricStats): string {
  if (s.n === 0) return "no data"
  if (s.sign_test_p < 0.05) {
    return s.delta_mean >= 0 ? "fused better *" : "fused worse *"
  }
  return "inconclusive"
}

function fmtSigned(n: number, digits = 4): string {
  if (!Number.isFinite(n)) return "—"
  const s = n.toFixed(digits)
  return n >= 0 ? `+${s}` : s
}

function buildStatsMarkdownSection(stats: StatisticsBlock): string {
  const lines: string[] = []
  lines.push("## Statistical Significance (fused vs best single draft)")
  lines.push("")
  lines.push(
    "| Metric  | n  | Δ mean   | Δ stdev | Wins / Losses (Ties) | Sign-test p | Verdict        |",
  )
  lines.push(
    "|---------|----|----------|---------|----------------------|-------------|----------------|",
  )
  for (const metric of OVERLAP_METRICS) {
    const s = stats.per_metric[metric]
    if (!s) continue
    const wlt =
      s.ties > 0 ? `${s.wins} / ${s.losses} (${s.ties})` : `${s.wins} / ${s.losses}`
    lines.push(
      `| ${METRIC_LABELS[metric].padEnd(7)} | ${String(s.n).padEnd(2)} | ${fmtSigned(
        s.delta_mean,
      )} | ${s.delta_stdev.toFixed(4)} | ${wlt.padEnd(20)} | ${s.sign_test_p.toFixed(4)}      | ${verdict(s).padEnd(14)} |`,
    )
  }
  if (stats.pairwise_judge) {
    const j = stats.pairwise_judge
    const wlt = `${j.wins_fused} / ${j.wins_best} (${j.ties})`
    lines.push(
      `| Judge   | ${String(j.n).padEnd(2)} | —        | —       | ${wlt.padEnd(20)} | ${j.sign_test_p.toFixed(4)}      | ${(j.sign_test_p < 0.05 ? (j.wins_fused > j.wins_best ? "fused better *" : "fused worse *") : "inconclusive").padEnd(14)} |`,
    )
  }
  lines.push("")
  lines.push("`*` significant at p < 0.05.")
  lines.push("")
  return lines.join("\n")
}

// ─── LLM-Judge pairwise markdown section ──────────────────────────────────

const RUBRIC_DIMENSIONS = ["faithfulness", "coverage", "fluency", "conciseness"] as const
type RubricDim = (typeof RUBRIC_DIMENSIONS)[number]

function buildJudgeMarkdownSection(
  records: ArticleRecord[],
  stats: StatisticsBlock,
): string | null {
  const fusionVerdicts = records
    .map(r => r.fusion.judge_pairwise)
    .filter((v): v is JudgePairwiseBlock => !!v)
  if (fusionVerdicts.length === 0) return null

  // If multiple judge models were used in the batch, list them all.
  const judgeModels = Array.from(
    new Set(fusionVerdicts.map(v => v.judge_model).filter(Boolean)),
  )

  const lines: string[] = []
  lines.push("## LLM-Judge Pairwise (Fused vs Best-Draft)")
  lines.push("")
  if (judgeModels.length > 0) {
    lines.push(`- **Judge model${judgeModels.length > 1 ? "s" : ""}:** ${judgeModels.join(", ")}`)
  }
  lines.push(`- **Verdicts collected:** ${fusionVerdicts.length}/${records.length}`)
  lines.push("")

  // Overall headline (uses statistics.pairwise_judge already computed).
  if (stats.pairwise_judge) {
    const j = stats.pairwise_judge
    const sig = j.sign_test_p < 0.05 ? "**significant** at p < 0.05" : "inconclusive"
    lines.push(
      `**Overall:** fused wins ${j.wins_fused} · best-draft wins ${j.wins_best} · ties ${j.ties} · sign-test p = ${j.sign_test_p.toFixed(4)} (${sig}).`,
    )
    lines.push("")
  }

  // Per-dimension win rates.
  const dimCounts: Record<RubricDim, { fused: number; best: number; tie: number }> = {
    faithfulness: { fused: 0, best: 0, tie: 0 },
    coverage: { fused: 0, best: 0, tie: 0 },
    fluency: { fused: 0, best: 0, tie: 0 },
    conciseness: { fused: 0, best: 0, tie: 0 },
  }
  for (const v of fusionVerdicts) {
    for (const d of RUBRIC_DIMENSIONS) {
      const cell = v.per_dimension?.[d]
      if (cell === "tie") dimCounts[d].tie++
      else if (cell === "A") {
        v.summary_a_label === "fused" ? dimCounts[d].fused++ : dimCounts[d].best++
      } else if (cell === "B") {
        v.summary_b_label === "fused" ? dimCounts[d].fused++ : dimCounts[d].best++
      }
    }
  }

  lines.push("### Per-dimension win rates")
  lines.push("")
  lines.push("| Dimension     | Fused | Best-draft | Tie | n  |")
  lines.push("|---------------|-------|------------|-----|----|")
  for (const d of RUBRIC_DIMENSIONS) {
    const c = dimCounts[d]
    const n = c.fused + c.best + c.tie
    lines.push(
      `| ${d.padEnd(13)} | ${String(c.fused).padEnd(5)} | ${String(c.best).padEnd(10)} | ${String(c.tie).padEnd(3)} | ${String(n).padEnd(2)} |`,
    )
  }
  lines.push("")
  return lines.join("\n")
}

// ─── Stats-only post-processing ────────────────────────────────────────────

interface PersistedBatch {
  started_at: string
  finished_at: string
  api_base?: string
  proposers?: string[]
  aggregator?: string
  records: ArticleRecord[]
  statistics?: StatisticsBlock
  [key: string]: unknown
}

function runStatsOnly(jsonPath: string): void {
  const abs = path.resolve(process.cwd(), jsonPath)
  if (!fs.existsSync(abs)) {
    console.error(`Stats input not found: ${abs}`)
    process.exit(1)
  }
  const raw = fs.readFileSync(abs, "utf-8")
  const data: PersistedBatch = JSON.parse(raw)
  if (!Array.isArray(data.records)) {
    console.error(`Input is not a batch JSON: missing 'records' array`)
    process.exit(1)
  }
  const stats = computeStatistics(data.records)
  data.statistics = stats
  fs.writeFileSync(abs, JSON.stringify(data, null, 2))

  const mdPath = abs.replace(/\.json$/, ".md")
  if (fs.existsSync(mdPath)) {
    let md = fs.readFileSync(mdPath, "utf-8")
    const statsSection = buildStatsMarkdownSection(stats)
    // Replace existing Statistical Significance section if present, otherwise append.
    const statsHeaderRe = /## Statistical Significance[\s\S]*?(?=\n## |\n$)/
    md = statsHeaderRe.test(md)
      ? md.replace(statsHeaderRe, statsSection.trimEnd() + "\n")
      : md.trimEnd() + "\n\n" + statsSection

    const judgeSection = buildJudgeMarkdownSection(data.records, stats)
    if (judgeSection) {
      const judgeHeaderRe = /## LLM-Judge Pairwise[\s\S]*?(?=\n## |\n$)/
      md = judgeHeaderRe.test(md)
        ? md.replace(judgeHeaderRe, judgeSection.trimEnd() + "\n")
        : md.trimEnd() + "\n\n" + judgeSection
    }
    fs.writeFileSync(mdPath, md)
    console.log(`Wrote stats   → ${mdPath}`)
  } else {
    console.log(`(no .md sibling found at ${mdPath} — JSON-only update)`)
  }
  console.log(`Wrote JSON    → ${abs}`)
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
  console.log(`Skip forced: ${SKIP_FORCED}`)
  console.log(`Judge mode:  ${JUDGE_MODE}${JUDGE_ENABLED ? ` (style=${JUDGE_STYLE}, model=${JUDGE_MODEL})` : ""}`)
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
    if (!SKIP_FORCED) {
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
    }

    process.stdout.write(`  fusion … `)
    const fusion = await runFusion(url)
    if (fusion.error) {
      console.log(`✗ ${fusion.error}`)
    } else {
      const verdictTag = fusion.judge_pairwise
        ? ` · judge: ${fusion.judge_pairwise.winner_label ?? fusion.judge_pairwise.winner}`
        : ""
      console.log(
        `✓ ${fusion.latency_ms}ms · BERT ${fmt(
          fusion.fused_scores?.bert_score ?? null,
          4,
        )} · cost ${fmt(fusion.total_cost_usd, 6)}${verdictTag}`,
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

  const statistics = computeStatistics(records)

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
        statistics,
      },
      null,
      2,
    ),
  )

  const judgeSection = buildJudgeMarkdownSection(records, statistics)
  fs.writeFileSync(
    SUMMARY_PATH,
    buildMarkdownReport(records, startedAt, finishedAt) +
      "\n" +
      buildStatsMarkdownSection(statistics) +
      (judgeSection ? "\n" + judgeSection : ""),
  )

  console.log("")
  console.log(`Wrote JSON   → ${OUTPUT_PATH}`)
  console.log(`Wrote report → ${SUMMARY_PATH}`)
}

if (STATS_ONLY) {
  try {
    runStatsOnly(STATS_ONLY)
  } catch (err) {
    console.error("FATAL:", err)
    process.exit(1)
  }
} else {
  main().catch(err => {
    console.error("FATAL:", err)
    process.exit(1)
  })
}
