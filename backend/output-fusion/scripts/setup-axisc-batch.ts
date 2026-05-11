#!/usr/bin/env tsx
/**
 * setup-axisc-batch.ts
 *
 * Creates `human_eval_tasks` rows for Axis C (M-H human peer study) by
 * pulling already-evaluated candidate summaries from the DB.
 *
 * For each URL in the input file [start..start+count), the script builds a
 * task with three blind candidates:
 *   1. Fused          — latest mode='fusion' row in evaluation_metrics
 *   2. gpt-4o-alone   — latest mode='sync', model='gpt-4o-2024-08-06' row
 *   3. cheap proposer — latest gpt-4o-mini draft from moa_draft_results
 *                       (linked via moa_fusion_results.article_url)
 *
 * Labels A/B/C are randomized per task so position bias is controlled across
 * raters. The hidden_model + hidden_mode + evaluation_metric_id columns are
 * preserved so the admin can reveal everything via /api/human-eval?id=...&reveal=1.
 *
 * Usage:
 *   cd backend
 *   npx tsx output-fusion/scripts/setup-axisc-batch.ts --dry-run
 *   npx tsx output-fusion/scripts/setup-axisc-batch.ts --commit
 *
 *   # Resume from URL 10 onwards:
 *   npx tsx output-fusion/scripts/setup-axisc-batch.ts --start 10 --count 10 --commit
 *
 * Flags:
 *   --input     Path to JSON file with { "urls": [...] }. Default: sample-urls-dataset-50.json
 *   --start     0-indexed start position in URL list. Default: 0
 *   --count     Number of URLs to set up. Default: 10
 *   --notes     Free-text notes attached to every created task (e.g., "Đợt 1").
 *   --commit    Required to actually insert rows. Without this flag, runs in dry-run mode.
 *   --proposer  Draft model_name to pull. Default: gpt-4o-mini
 */

import * as path from "node:path"
import * as fs from "node:fs"
import { config as loadDotenv } from "dotenv"

loadDotenv({ path: path.resolve(__dirname, "../../.env") })

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { extractContentFromUrl } from "@/services/content-extraction.service"

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

const INPUT_PATH = getArg(
  "input",
  path.resolve(__dirname, "sample-urls-dataset-50.json"),
)
const START = getIntArg("start", 0)
const COUNT = getIntArg("count", 10)
const NOTES = getArg("notes", "")
const COMMIT = args.includes("--commit")
const PROPOSER_MODEL = getArg("proposer", "gpt-4o-mini")
const SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"

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

interface CandidateSummary {
  text: string
  hidden_model: string
  hidden_mode: string
  evaluation_metric_id?: string
}

interface UrlPlan {
  url: string
  fused: CandidateSummary | null
  single: CandidateSummary | null
  proposer: CandidateSummary | null
  existingTaskId?: string
}

// ─── Candidate fetch helpers ──────────────────────────────────────────────

async function fetchFusedCandidate(url: string): Promise<CandidateSummary | null> {
  const { data, error } = await supabase
    .from("evaluation_metrics")
    .select("id, summary_text, model, mode, created_at")
    .eq("url", url)
    .eq("mode", "fusion")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`fetchFusedCandidate(${url}): ${error.message}`)
  if (!data) return null
  return {
    text: data.summary_text,
    hidden_model: data.model ?? "moa:fused",
    hidden_mode: "fusion",
    evaluation_metric_id: data.id,
  }
}

async function fetchSingleAggregatorCandidate(
  url: string,
): Promise<CandidateSummary | null> {
  const { data, error } = await supabase
    .from("evaluation_metrics")
    .select("id, summary_text, model, mode, created_at")
    .eq("url", url)
    .eq("mode", "sync")
    .like("model", "gpt-4o%")
    .not("model", "ilike", "%mini%")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`fetchSingleAggregatorCandidate(${url}): ${error.message}`)
  if (!data) return null
  return {
    text: data.summary_text,
    hidden_model: data.model ?? "gpt-4o",
    hidden_mode: "sync",
    evaluation_metric_id: data.id,
  }
}

async function fetchProposerDraft(
  url: string,
  modelName: string,
): Promise<CandidateSummary | null> {
  const { data: fusionRows, error: fErr } = await supabase
    .from("moa_fusion_results")
    .select("id, created_at")
    .eq("article_url", url)
    .order("created_at", { ascending: false })
    .limit(5)
  if (fErr) throw new Error(`fetchProposerDraft fusion(${url}): ${fErr.message}`)
  if (!fusionRows || fusionRows.length === 0) return null

  for (const fusion of fusionRows) {
    const { data: drafts, error: dErr } = await supabase
      .from("moa_draft_results")
      .select("id, model_name, summary, status")
      .eq("fusion_id", fusion.id)
      .eq("model_name", modelName)
      .eq("status", "success")
      .limit(1)
    if (dErr) throw new Error(`fetchProposerDraft draft(${url}): ${dErr.message}`)
    if (drafts && drafts.length > 0 && drafts[0].summary) {
      return {
        text: drafts[0].summary,
        hidden_model: drafts[0].model_name,
        hidden_mode: "proposer_draft",
      }
    }
  }
  return null
}

async function checkExistingTask(url: string): Promise<string | undefined> {
  const { data, error } = await supabase
    .from("human_eval_tasks")
    .select("id")
    .eq("article_url", url)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`checkExistingTask(${url}): ${error.message}`)
  return data?.id
}

// ─── Build a task per URL ─────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

async function buildPlan(url: string): Promise<UrlPlan> {
  const existingTaskId = await checkExistingTask(url)
  const [fused, single, proposer] = await Promise.all([
    fetchFusedCandidate(url),
    fetchSingleAggregatorCandidate(url),
    fetchProposerDraft(url, PROPOSER_MODEL),
  ])
  return { url, fused, single, proposer, existingTaskId }
}

async function insertTask(plan: UrlPlan): Promise<{ id: string; share_url: string }> {
  if (!plan.fused || !plan.single || !plan.proposer) {
    throw new Error(`insertTask called with incomplete plan for ${plan.url}`)
  }

  const extracted = await extractContentFromUrl(plan.url)
  const articleText = extracted.content.trim()
  if (!articleText) {
    throw new Error(`Empty article text after extraction for ${plan.url}`)
  }

  const candidates = shuffle([plan.fused, plan.single, plan.proposer])
  const summaries = candidates.map((c, i) => ({
    label: String.fromCharCode("A".charCodeAt(0) + i),
    text: c.text,
    hidden_model: c.hidden_model,
    hidden_mode: c.hidden_mode,
    ...(c.evaluation_metric_id ? { evaluation_metric_id: c.evaluation_metric_id } : {}),
  }))

  const { data, error } = await supabase
    .from("human_eval_tasks")
    .insert({
      article_url: plan.url,
      article_text: articleText,
      summaries,
      notes: NOTES || null,
    })
    .select("id")
    .single()
  if (error || !data) {
    throw new Error(
      `insertTask(${plan.url}): ${error?.message ?? "insert returned no row"}`,
    )
  }

  return {
    id: data.id,
    share_url: `${SITE_ORIGIN}/evaluate?task=${data.id}`,
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const raw = JSON.parse(fs.readFileSync(INPUT_PATH, "utf8")) as { urls: string[] }
  if (!raw.urls?.length) {
    console.error(`No urls[] in ${INPUT_PATH}`)
    process.exit(1)
  }

  // Dedupe while preserving original order, then take the requested slice.
  const seen = new Set<string>()
  const dedupedAll: string[] = []
  for (const u of raw.urls) {
    if (!seen.has(u)) {
      seen.add(u)
      dedupedAll.push(u)
    }
  }
  const slice = dedupedAll.slice(START, START + COUNT)

  console.log(
    `\n=== Axis C task setup ===\n` +
      `Input:    ${INPUT_PATH}\n` +
      `Window:   [${START}..${START + slice.length}) of ${dedupedAll.length} unique URLs\n` +
      `Mode:     ${COMMIT ? "COMMIT (writes to DB)" : "DRY-RUN (no writes)"}\n` +
      `Notes:    ${NOTES || "(none)"}\n` +
      `Proposer: ${PROPOSER_MODEL}\n`,
  )

  const plans: UrlPlan[] = []
  for (let i = 0; i < slice.length; i++) {
    const url = slice[i]
    process.stdout.write(`[${i + 1}/${slice.length}] ${url}\n`)
    const plan = await buildPlan(url)
    plans.push(plan)
    console.log(
      `   fused:    ${plan.fused ? "✓" : "✗ MISSING"}\n` +
        `   gpt-4o:   ${plan.single ? "✓" : "✗ MISSING"}\n` +
        `   ${PROPOSER_MODEL}: ${plan.proposer ? "✓" : "✗ MISSING"}\n` +
        `   existing: ${plan.existingTaskId ? `task ${plan.existingTaskId}` : "(none)"}\n`,
    )
  }

  const eligible = plans.filter(
    (p) => p.fused && p.single && p.proposer && !p.existingTaskId,
  )
  const missing = plans.filter((p) => !p.fused || !p.single || !p.proposer)
  const skipped = plans.filter((p) => p.existingTaskId)

  console.log(
    `\nSummary: ${eligible.length} eligible, ${missing.length} missing candidates, ${skipped.length} already-have-task\n`,
  )

  if (!COMMIT) {
    console.log(
      "Dry-run only. To actually create the tasks, re-run with --commit.\n",
    )
    return
  }

  if (eligible.length === 0) {
    console.log("Nothing to insert.\n")
    return
  }

  console.log(`Inserting ${eligible.length} task(s)...\n`)
  const created: { url: string; id: string; share_url: string }[] = []
  for (let i = 0; i < eligible.length; i++) {
    const plan = eligible[i]
    process.stdout.write(`[${i + 1}/${eligible.length}] ${plan.url}\n`)
    try {
      const result = await insertTask(plan)
      console.log(`   ✓ ${result.id}\n     ${result.share_url}\n`)
      created.push({ url: plan.url, ...result })
    } catch (err) {
      console.error(`   ✗ ${err instanceof Error ? err.message : err}\n`)
    }
  }

  console.log(`\n=== Created ${created.length} task(s) ===`)
  for (const r of created) {
    console.log(`${r.id}  ${r.share_url}`)
  }
  console.log(`\nAdmin review: ${SITE_ORIGIN}/evaluate/admin\n`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
