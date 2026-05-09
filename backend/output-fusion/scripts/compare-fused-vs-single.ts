#!/usr/bin/env tsx
/**
 * compare-fused-vs-single.ts
 *
 * For each article that has BOTH a `mode='fusion'` row and a
 * `mode='sync' AND model LIKE 'gpt-4o%'` (excluding mini variants) row in
 * `evaluation_metrics` within the time window, run a pairwise judge call
 * (fused as A, gpt-4o-alone as B) and persist the verdict to
 * `llm_judge_pairwise` with `comparison_type='vs_single_aggregator'`.
 *
 * The thesis-decisive question: "Does fusion add value beyond running the
 * aggregator model alone?" — isolates synthesis behavior from aggregator
 * model capability (both candidates are gpt-4o-produced, so judge family
 * bias cancels).
 *
 * Usage:
 *   cd backend
 *   npx tsx output-fusion/scripts/compare-fused-vs-single.ts \
 *     --since 2026-05-09T08:51:03Z \
 *     --judge-model gpt-4o-mini
 *
 * Flags:
 *   --since         ISO timestamp. Required-ish (all eligible pairs in window).
 *   --until         ISO timestamp. Optional upper bound.
 *   --judge-model   Default: gpt-4o-mini.
 *   --dry-run       Compute verdicts but do NOT persist them.
 *   --limit         Cap pairs processed (smoke test).
 */

import * as path from "node:path"
import { config as loadDotenv } from "dotenv"

// Load env BEFORE importing services that may inspect process.env at import.
loadDotenv({ path: path.resolve(__dirname, "../../.env") })

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { judgePairwise } from "@/services/llm-judge.service"
import { extractContentFromUrl } from "@/services/content-extraction.service"
import type { ModelConfig } from "@/domain/types"

// ─── CLI args ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
function getArg(name: string, fallback: string = ""): string {
  const idx = args.indexOf(`--${name}`)
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback
}
function getIntArg(name: string, fallback: number): number {
  const raw = getArg(name)
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

const SINCE = getArg("since")
const UNTIL = getArg("until")
const JUDGE_MODEL_NAME = getArg("judge-model", "gpt-4o-mini")
const DRY_RUN = args.includes("--dry-run")
const LIMIT = getIntArg("limit", 0)

// ─── Supabase ─────────────────────────────────────────────────────────────

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in backend/.env")
  process.exit(1)
}
const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ─── Types ────────────────────────────────────────────────────────────────

interface EvalRow {
  id: string
  url: string | null
  mode: string
  model: string | null
  summary_text: string
  created_at: string
}

interface Pair {
  url: string
  fused: EvalRow
  single: EvalRow
}

// ─── Pairing logic ────────────────────────────────────────────────────────

async function fetchPairs(): Promise<Pair[]> {
  let query = supabase
    .from("evaluation_metrics")
    .select("id, url, mode, model, summary_text, created_at")
    .order("url", { ascending: true })
    .order("created_at", { ascending: false })
  if (SINCE) query = query.gte("created_at", SINCE)
  if (UNTIL) query = query.lte("created_at", UNTIL)

  const { data, error } = await query
  if (error) throw new Error(`fetchPairs: ${error.message}`)

  const isFusion = (r: EvalRow) => r.mode === "fusion"
  const isSingleGpt4o = (r: EvalRow) =>
    r.mode === "sync" &&
    typeof r.model === "string" &&
    r.model.startsWith("gpt-4o") &&
    !r.model.includes("mini")

  const byUrl = new Map<string, { fused?: EvalRow; single?: EvalRow }>()
  for (const row of (data ?? []) as EvalRow[]) {
    if (!row.url || !row.summary_text) continue
    const bucket = byUrl.get(row.url) ?? {}
    if (!bucket.fused && isFusion(row)) bucket.fused = row
    if (!bucket.single && isSingleGpt4o(row)) bucket.single = row
    byUrl.set(row.url, bucket)
  }

  const pairs: Pair[] = []
  for (const [u, bucket] of byUrl) {
    if (bucket.fused && bucket.single) {
      pairs.push({ url: u, fused: bucket.fused, single: bucket.single })
    }
  }
  return pairs
}

async function fetchJudgeModel(name: string): Promise<ModelConfig | null> {
  const { data, error } = await supabase
    .from("model_configurations")
    .select("*")
    .eq("model_name", name)
    .maybeSingle()
  if (error) throw new Error(`fetchJudgeModel: ${error.message}`)
  return (data as ModelConfig | null) ?? null
}

async function persistVerdict(
  pair: Pair,
  verdict: Awaited<ReturnType<typeof judgePairwise>>,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("llm_judge_pairwise").insert({
    routing_id: null,
    fusion_id: null,
    summary_a_label: "fused",
    summary_b_label: "single_aggregator",
    winner: verdict.winner,
    per_dimension: verdict.per_dimension,
    justification: verdict.justification,
    length_note: verdict.length_note,
    judge_model: verdict.judge_model,
    judge_cost_usd: verdict.cost_usd,
    judge_latency_ms: verdict.latency_ms,
    position_swapped: verdict.position_swapped,
    comparison_type: "vs_single_aggregator",
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(70))
  console.log("FUSED vs SINGLE-AGGREGATOR pairwise judge")
  console.log("=".repeat(70))
  console.log(`Judge model:  ${JUDGE_MODEL_NAME}`)
  console.log(`Since:        ${SINCE || "(none)"}`)
  console.log(`Until:        ${UNTIL || "(none)"}`)
  console.log(`Limit:        ${LIMIT || "(none)"}`)
  console.log(`Dry run:      ${DRY_RUN}`)
  console.log("")

  const judgeModel = await fetchJudgeModel(JUDGE_MODEL_NAME)
  if (!judgeModel) {
    console.error(
      `Judge model "${JUDGE_MODEL_NAME}" not found in model_configurations.`,
    )
    process.exit(1)
  }

  const allPairs = await fetchPairs()
  const pairs = LIMIT > 0 ? allPairs.slice(0, LIMIT) : allPairs
  console.log(
    `Found ${allPairs.length} paired (fusion × single-gpt-4o) runs; processing ${pairs.length}.`,
  )
  if (pairs.length === 0) {
    console.log(
      "Nothing to do. Run synthesis batch + run-single-baseline.ts first.",
    )
    return
  }
  console.log("")

  let fusedWins = 0
  let singleWins = 0
  let ties = 0
  let saved = 0
  let skipped = 0
  let totalCost = 0

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i]
    const tag = `[${i + 1}/${pairs.length}]`
    process.stdout.write(`${tag} ${pair.url} … `)

    let articleText: string
    try {
      const extracted = await extractContentFromUrl(pair.url)
      articleText = extracted.content
    } catch (err) {
      console.log(`✗ extract: ${err instanceof Error ? err.message : String(err)}`)
      skipped++
      continue
    }

    let verdict: Awaited<ReturnType<typeof judgePairwise>>
    try {
      verdict = await judgePairwise(
        { label: "fused", text: pair.fused.summary_text },
        { label: "single_aggregator", text: pair.single.summary_text },
        articleText,
        { model: judgeModel, logContext: "compare-fused-vs-single" },
      )
    } catch (err) {
      console.log(`✗ judge: ${err instanceof Error ? err.message : String(err)}`)
      skipped++
      continue
    }

    if (verdict.cost_usd) totalCost += verdict.cost_usd
    if (verdict.winner === "tie") ties++
    else if (verdict.winner_label === "fused") fusedWins++
    else singleWins++

    const cost = verdict.cost_usd ? `$${verdict.cost_usd.toFixed(6)}` : "?"
    console.log(
      `✓ winner=${verdict.winner_label ?? verdict.winner} (${verdict.latency_ms}ms, ${cost})`,
    )

    if (!DRY_RUN) {
      const persistResult = await persistVerdict(pair, verdict)
      if (persistResult.ok) saved++
      else console.log(`  ! save error: ${persistResult.error}`)
    }
  }

  // ─── Summary ────────────────────────────────────────────────────────────
  console.log("")
  console.log("=".repeat(70))
  console.log("RESULTS")
  console.log("=".repeat(70))
  const decisive = fusedWins + singleWins
  console.log(`Fused wins:                    ${fusedWins}`)
  console.log(`Single-aggregator wins:        ${singleWins}`)
  console.log(`Ties:                          ${ties}`)
  console.log(`Skipped (extract/judge fail):  ${skipped}`)
  console.log(`Verdicts saved:                ${saved}${DRY_RUN ? " (dry run)" : ""}`)
  console.log(`Total judge cost:              $${totalCost.toFixed(6)}`)
  if (decisive > 0) {
    const pct = ((fusedWins / decisive) * 100).toFixed(1)
    console.log(`Fused decisive win rate:       ${pct}% (${fusedWins}/${decisive})`)
  }
}

main().catch(err => {
  console.error("FATAL:", err)
  process.exit(1)
})
