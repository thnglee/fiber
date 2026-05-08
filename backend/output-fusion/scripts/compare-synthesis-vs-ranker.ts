#!/usr/bin/env tsx
/**
 * compare-synthesis-vs-ranker.ts
 *
 * For each article that has BOTH a `pipeline_mode='moa_synthesis'` row and a
 * `pipeline_mode='llm_ranker'` row in `moa_fusion_results` within the batch
 * window, run a pairwise judge call (synthesis as A, ranker as B) and persist
 * the verdict to `llm_judge_pairwise` with `comparison_type='synthesis_vs_ranker'`.
 *
 * Wang et al. (2024) Figure 4a comparison applied to our domain: does MoA
 * actually aggregate (synthesis wins) or merely select (synthesis ties /
 * loses)?
 *
 * Usage:
 *   npx tsx output-fusion/scripts/compare-synthesis-vs-ranker.ts \
 *     --since 2026-05-08 \
 *     --judge-model gpt-4o-mini
 *
 * Flags:
 *   --since         ISO timestamp. Limits paired rows to this lower bound.
 *   --until         ISO timestamp. Optional upper bound.
 *   --judge-model   Model name (must exist in `model_configurations`).
 *                   Default: gpt-4o-mini.
 *   --dry-run       Compute verdicts but do NOT persist them. Useful for
 *                   smoke-testing the pairing logic without polluting the
 *                   table.
 *   --limit         Cap number of pairs processed (handy for quick checks).
 */

import * as path from "node:path"
import { config as loadDotenv } from "dotenv"

// Load env BEFORE importing services that may inspect process.env at import.
loadDotenv({ path: path.resolve(__dirname, "../../.env") })

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { judgePairwise } from "@/services/llm-judge.service"
import { extractContentFromUrl } from "@/services/content-extraction.service"
import type { ModelConfig } from "@/domain/types"

// ─── CLI args ──────────────────────────────────────────────────────────────

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

// ─── Supabase client ───────────────────────────────────────────────────────

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in backend/.env",
  )
  process.exit(1)
}
const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ─── Types ─────────────────────────────────────────────────────────────────

interface FusionRow {
  id: string
  routing_id: string | null
  article_url: string | null
  pipeline_mode: "moa_synthesis" | "llm_ranker"
  fused_summary: string
  created_at: string
}

interface Pair {
  url: string
  synthesis: FusionRow
  ranker: FusionRow
}

// ─── Steps ─────────────────────────────────────────────────────────────────

async function fetchPairs(): Promise<Pair[]> {
  let query = supabase
    .from("moa_fusion_results")
    .select(
      "id, routing_id, article_url, pipeline_mode, fused_summary, created_at",
    )
    .order("article_url", { ascending: true })
    .order("created_at", { ascending: false })
  if (SINCE) query = query.gte("created_at", SINCE)
  if (UNTIL) query = query.lte("created_at", UNTIL)

  const { data, error } = await query
  if (error) throw new Error(`fetchPairs: ${error.message}`)

  // Group by article_url; keep the most recent of each pipeline_mode.
  const byUrl = new Map<string, { synthesis?: FusionRow; ranker?: FusionRow }>()
  for (const row of (data ?? []) as FusionRow[]) {
    if (!row.article_url || !row.fused_summary) continue
    const bucket = byUrl.get(row.article_url) ?? {}
    if (row.pipeline_mode === "moa_synthesis" && !bucket.synthesis)
      bucket.synthesis = row
    if (row.pipeline_mode === "llm_ranker" && !bucket.ranker)
      bucket.ranker = row
    byUrl.set(row.article_url, bucket)
  }

  const pairs: Pair[] = []
  for (const [url, bucket] of byUrl) {
    if (bucket.synthesis && bucket.ranker) {
      pairs.push({ url, synthesis: bucket.synthesis, ranker: bucket.ranker })
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
    routing_id: pair.synthesis.routing_id ?? null,
    fusion_id: pair.synthesis.id,
    summary_a_label: "synthesis",
    summary_b_label: "ranker",
    winner: verdict.winner,
    per_dimension: verdict.per_dimension,
    justification: verdict.justification,
    length_note: verdict.length_note,
    judge_model: verdict.judge_model,
    judge_cost_usd: verdict.cost_usd,
    judge_latency_ms: verdict.latency_ms,
    position_swapped: verdict.position_swapped,
    comparison_type: "synthesis_vs_ranker",
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(70))
  console.log("SYNTHESIS vs RANKER pairwise judge")
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
    `Found ${allPairs.length} paired (synthesis × ranker) runs; processing ${pairs.length}.`,
  )
  if (pairs.length === 0) {
    console.log("Nothing to do. Run synthesis + ranker_only batches first.")
    return
  }
  console.log("")

  let synthesisWins = 0
  let rankerWins = 0
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
      console.log(
        `✗ extract: ${err instanceof Error ? err.message : String(err)}`,
      )
      skipped++
      continue
    }

    let verdict: Awaited<ReturnType<typeof judgePairwise>>
    try {
      verdict = await judgePairwise(
        { label: "synthesis", text: pair.synthesis.fused_summary },
        { label: "ranker", text: pair.ranker.fused_summary },
        articleText,
        { model: judgeModel, logContext: "compare-synthesis-vs-ranker" },
      )
    } catch (err) {
      console.log(`✗ judge: ${err instanceof Error ? err.message : String(err)}`)
      skipped++
      continue
    }

    if (verdict.cost_usd) totalCost += verdict.cost_usd
    if (verdict.winner === "tie") ties++
    else if (verdict.winner_label === "synthesis") synthesisWins++
    else rankerWins++

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
  const decisive = synthesisWins + rankerWins
  console.log(`Synthesis wins:                ${synthesisWins}`)
  console.log(`Ranker wins:                   ${rankerWins}`)
  console.log(`Ties:                          ${ties}`)
  console.log(`Skipped (extract/judge fail):  ${skipped}`)
  console.log(`Verdicts saved:                ${saved}${DRY_RUN ? " (dry run)" : ""}`)
  console.log(`Total judge cost:              $${totalCost.toFixed(6)}`)
  if (decisive > 0) {
    const pct = ((synthesisWins / decisive) * 100).toFixed(1)
    console.log(`Synthesis decisive win rate:   ${pct}% (${synthesisWins}/${decisive})`)
  }
}

main().catch(err => {
  console.error("FATAL:", err)
  process.exit(1)
})
