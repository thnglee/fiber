#!/usr/bin/env tsx
/**
 * Unified three-axis evaluation report generator (Stage 6, M-G).
 *
 * Reads the live Supabase tables — evaluation_metrics, llm_judge_pairwise,
 * human_eval_tasks, human_eval_responses — and emits a single thesis-ready
 * Markdown file matching the schema in metrics_system_PRD.md §8:
 *
 *   ## Axis A — Content Retention
 *   ## Axis B — Quality & Preference
 *     ### B.1 LLM-Judge rubric (FLASK-derived)
 *     ### B.2 LLM-Judge pairwise (fusion only)
 *     ### B.3 Factuality
 *   ## Axis C — Human Validation
 *
 * Each row in axes A/B groups summaries by (mode, model). Axis C pools across
 * human_eval tasks so each approach's avg-rank / win-rate / κ is reported once.
 *
 * Usage:
 *   npx tsx output-fusion/scripts/unified-report.ts \
 *     --since 2026-04-01 \
 *     --output ../metrics_reports/results/unified-report-<date>.md
 *
 * Flags:
 *   --since         ISO date (YYYY-MM-DD). Filters all axes to rows on/after it.
 *   --until         ISO date (YYYY-MM-DD). Optional upper bound.
 *   --output        Path for the Markdown file. Defaults to
 *                   ../metrics_reports/results/unified-report-<ISO>.md
 *   --task-ids      Comma-separated human_eval_task ids to include in Axis C.
 *                   Defaults: all tasks in window.
 *   --min-runs      Minimum row count per (mode, model) to surface in axes
 *                   A / B.1 / B.3. Default 1.
 *   --json          Also write a JSON sidecar with raw aggregates next to the
 *                   Markdown file.
 */
import * as fs from "node:fs"
import * as path from "node:path"

import { config as loadDotenv } from "dotenv"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import {
  aggregateRankings,
  fleissKappaFromRankings,
} from "./stats"

// ─── Bootstrap env ─────────────────────────────────────────────────────────

loadDotenv({ path: path.resolve(__dirname, "../../.env") })

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env.",
  )
  process.exit(1)
}

const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

// ─── CLI args ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
function getArg(name: string, fallback = ""): string {
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
const TASK_IDS = getArg("task-ids")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
const MIN_RUNS = getIntArg("min-runs", 1)
const WRITE_JSON = args.includes("--json")

const DEFAULT_OUTPUT_DIR = path.resolve(
  __dirname,
  "../../../metrics_reports/results",
)
const OUTPUT_PATH = path.resolve(
  process.cwd(),
  getArg(
    "output",
    path.join(
      DEFAULT_OUTPUT_DIR,
      `unified-report-${new Date().toISOString().replace(/[:.]/g, "-")}.md`,
    ),
  ),
)
const JSON_PATH = OUTPUT_PATH.replace(/\.md$/, ".json")

// ─── Types ─────────────────────────────────────────────────────────────────

interface JudgeRubric {
  faithfulness?: number | null
  coverage?: number | null
  fluency?: number | null
  conciseness?: number | null
  overall?: number | null
}

interface EvalRow {
  id: string
  created_at: string
  url: string | null
  mode: string | null
  model: string | null
  rouge_1: number | null
  rouge_2: number | null
  rouge_l: number | null
  bleu: number | null
  bert_score: number | null
  compression_rate: number | null
  summary_text: string | null
  original_text_length: number | null
  judge_rubric: JudgeRubric | null
  judge_absolute: number | null
  factuality_total_claims: number | null
  factuality_entailed_claims: number | null
  factuality_entailed_ratio: number | null
  factuality_hallucinations: Array<unknown> | null
}

interface PairwiseRow {
  id: string
  created_at: string
  summary_a_label: string
  summary_b_label: string
  winner: "A" | "B" | "tie" | string
  judge_model: string | null
}

interface HumanEvalSummaryEntry {
  label: string
  text: string
  hidden_model?: string
  hidden_mode?: string
}

interface HumanEvalTaskRow {
  id: string
  created_at: string
  article_url: string
  summaries: HumanEvalSummaryEntry[]
  notes: string | null
}

interface HumanEvalResponseRow {
  id: string
  task_id: string
  rater_id: string
  ranking: string[]
  rationale: Record<string, string>
  created_at: string
}

// ─── Fetchers ──────────────────────────────────────────────────────────────

async function fetchEvalRows(): Promise<EvalRow[]> {
  let q = supabase
    .from("evaluation_metrics")
    .select(
      [
        "id",
        "created_at",
        "url",
        "mode",
        "model",
        "rouge_1",
        "rouge_2",
        "rouge_l",
        "bleu",
        "bert_score",
        "compression_rate",
        "summary_text",
        "original_text_length",
        "judge_rubric",
        "judge_absolute",
        "factuality_total_claims",
        "factuality_entailed_claims",
        "factuality_entailed_ratio",
        "factuality_hallucinations",
      ].join(", "),
    )
    .order("created_at", { ascending: true })
  if (SINCE) q = q.gte("created_at", SINCE)
  if (UNTIL) q = q.lte("created_at", UNTIL)

  const all: EvalRow[] = []
  const PAGE = 1000
  let from = 0
  // Pagination loop — Supabase caps default selects at 1000 rows.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await q.range(from, from + PAGE - 1)
    if (error) throw new Error(`evaluation_metrics: ${error.message}`)
    const rows = (data ?? []) as unknown as EvalRow[]
    all.push(...rows)
    if (rows.length < PAGE) break
    from += PAGE
  }
  return all
}

async function fetchPairwiseRows(): Promise<PairwiseRow[]> {
  let q = supabase
    .from("llm_judge_pairwise")
    .select(
      "id, created_at, summary_a_label, summary_b_label, winner, judge_model",
    )
    .order("created_at", { ascending: true })
  if (SINCE) q = q.gte("created_at", SINCE)
  if (UNTIL) q = q.lte("created_at", UNTIL)
  const { data, error } = await q
  if (error) throw new Error(`llm_judge_pairwise: ${error.message}`)
  return (data ?? []) as unknown as PairwiseRow[]
}

async function fetchHumanEval(): Promise<{
  tasks: HumanEvalTaskRow[]
  responses: HumanEvalResponseRow[]
}> {
  let taskQ = supabase
    .from("human_eval_tasks")
    .select("id, created_at, article_url, summaries, notes")
    .order("created_at", { ascending: true })
  if (SINCE) taskQ = taskQ.gte("created_at", SINCE)
  if (UNTIL) taskQ = taskQ.lte("created_at", UNTIL)
  if (TASK_IDS.length > 0) taskQ = taskQ.in("id", TASK_IDS)

  const { data: tdata, error: terr } = await taskQ
  if (terr) throw new Error(`human_eval_tasks: ${terr.message}`)
  const tasks = (tdata ?? []) as unknown as HumanEvalTaskRow[]
  if (tasks.length === 0) return { tasks: [], responses: [] }

  const ids = tasks.map((t) => t.id)
  const { data: rdata, error: rerr } = await supabase
    .from("human_eval_responses")
    .select("id, task_id, rater_id, ranking, rationale, created_at")
    .in("task_id", ids)
    .order("created_at", { ascending: true })
  if (rerr) throw new Error(`human_eval_responses: ${rerr.message}`)
  const responses = (rdata ?? []) as unknown as HumanEvalResponseRow[]
  return { tasks, responses }
}

// ─── Aggregation helpers ───────────────────────────────────────────────────

function approachKey(mode: string | null, model: string | null): string {
  return `${mode ?? "—"} | ${model ?? "—"}`
}

function fmt(n: number | null | undefined, digits = 3): string {
  if (n == null || !Number.isFinite(n)) return "—"
  return n.toFixed(digits)
}

function meanOrNull(nums: Array<number | null | undefined>): number | null {
  const vals = nums.filter(
    (n): n is number => typeof n === "number" && Number.isFinite(n),
  )
  if (vals.length === 0) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

interface AxisAEntry {
  approach: string
  n: number
  rouge1: number | null
  rougeL: number | null
  bleu: number | null
  bert: number | null
  compression: number | null
}

function buildAxisA(rows: EvalRow[]): AxisAEntry[] {
  const groups = new Map<string, EvalRow[]>()
  for (const r of rows) {
    const k = approachKey(r.mode, r.model)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(r)
  }
  const entries: AxisAEntry[] = []
  for (const [approach, rs] of groups) {
    if (rs.length < MIN_RUNS) continue
    entries.push({
      approach,
      n: rs.length,
      rouge1: meanOrNull(rs.map((r) => r.rouge_1)),
      rougeL: meanOrNull(rs.map((r) => r.rouge_l)),
      bleu: meanOrNull(rs.map((r) => r.bleu)),
      bert: meanOrNull(rs.map((r) => r.bert_score)),
      compression: meanOrNull(rs.map((r) => r.compression_rate)),
    })
  }
  // Sort: best BERT first (NaNs at end).
  entries.sort((a, b) => (b.bert ?? -Infinity) - (a.bert ?? -Infinity))
  return entries
}

interface AxisBRubricEntry {
  approach: string
  n: number
  faithfulness: number | null
  coverage: number | null
  fluency: number | null
  conciseness: number | null
  overall: number | null
}

function buildAxisB1(rows: EvalRow[]): AxisBRubricEntry[] {
  const groups = new Map<string, EvalRow[]>()
  for (const r of rows) {
    if (!r.judge_rubric) continue
    const k = approachKey(r.mode, r.model)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(r)
  }
  const entries: AxisBRubricEntry[] = []
  for (const [approach, rs] of groups) {
    if (rs.length < MIN_RUNS) continue
    entries.push({
      approach,
      n: rs.length,
      faithfulness: meanOrNull(rs.map((r) => r.judge_rubric?.faithfulness ?? null)),
      coverage: meanOrNull(rs.map((r) => r.judge_rubric?.coverage ?? null)),
      fluency: meanOrNull(rs.map((r) => r.judge_rubric?.fluency ?? null)),
      conciseness: meanOrNull(rs.map((r) => r.judge_rubric?.conciseness ?? null)),
      overall: meanOrNull(rs.map((r) => r.judge_rubric?.overall ?? null)),
    })
  }
  entries.sort((a, b) => (b.overall ?? -Infinity) - (a.overall ?? -Infinity))
  return entries
}

interface AxisB2Entry {
  pair: string
  n: number
  a_wins: number
  b_wins: number
  ties: number
  winner: string
  judge_models: string[]
}

function buildAxisB2(rows: PairwiseRow[]): AxisB2Entry[] {
  const groups = new Map<string, PairwiseRow[]>()
  for (const r of rows) {
    const pair = `${r.summary_a_label} vs ${r.summary_b_label}`
    if (!groups.has(pair)) groups.set(pair, [])
    groups.get(pair)!.push(r)
  }
  const entries: AxisB2Entry[] = []
  for (const [pair, rs] of groups) {
    let a = 0,
      b = 0,
      t = 0
    for (const r of rs) {
      if (r.winner === "A") a++
      else if (r.winner === "B") b++
      else t++
    }
    const winner =
      a === b
        ? "tie"
        : a > b
          ? `A (${rs[0].summary_a_label})`
          : `B (${rs[0].summary_b_label})`
    const models = Array.from(new Set(rs.map((r) => r.judge_model).filter(Boolean))) as string[]
    entries.push({ pair, n: rs.length, a_wins: a, b_wins: b, ties: t, winner, judge_models: models })
  }
  entries.sort((a, b) => b.n - a.n)
  return entries
}

interface AxisB3Entry {
  approach: string
  n: number
  entailment_pct: number | null
  avg_hallucinations: number | null
  worst_case: number
}

function buildAxisB3(rows: EvalRow[]): AxisB3Entry[] {
  const groups = new Map<string, EvalRow[]>()
  for (const r of rows) {
    if (r.factuality_entailed_ratio == null) continue
    const k = approachKey(r.mode, r.model)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(r)
  }
  const entries: AxisB3Entry[] = []
  for (const [approach, rs] of groups) {
    if (rs.length < MIN_RUNS) continue
    const entailment = meanOrNull(rs.map((r) => r.factuality_entailed_ratio))
    const hallCounts = rs.map((r) =>
      Array.isArray(r.factuality_hallucinations)
        ? r.factuality_hallucinations.length
        : 0,
    )
    entries.push({
      approach,
      n: rs.length,
      entailment_pct: entailment == null ? null : entailment * 100,
      avg_hallucinations: meanOrNull(hallCounts),
      worst_case: hallCounts.reduce((m, c) => Math.max(m, c), 0),
    })
  }
  entries.sort(
    (a, b) => (b.entailment_pct ?? -Infinity) - (a.entailment_pct ?? -Infinity),
  )
  return entries
}

interface AxisCEntry {
  approach: string
  rater_count: number
  avg_rank: number
  win_rate: number
  task_count: number
}

interface AxisCResult {
  per_approach: AxisCEntry[]
  per_task: Array<{ task_id: string; article_url: string; kappa: number | null; rater_count: number }>
  pooled_kappa: number | null
}

function buildAxisC(
  tasks: HumanEvalTaskRow[],
  responses: HumanEvalResponseRow[],
): AxisCResult {
  const responsesByTask = new Map<string, HumanEvalResponseRow[]>()
  for (const r of responses) {
    if (!responsesByTask.has(r.task_id)) responsesByTask.set(r.task_id, [])
    responsesByTask.get(r.task_id)!.push(r)
  }

  // Per-task stats and pooled per-approach aggregates.
  const perApproach = new Map<
    string,
    { rank_sum: number; rank_n: number; win_sum: number; win_n: number; rater_count: number; tasks: Set<string> }
  >()
  const perTaskRows: AxisCResult["per_task"] = []
  const taskKappas: number[] = []

  for (const task of tasks) {
    const taskResponses = responsesByTask.get(task.id) ?? []
    if (taskResponses.length === 0) {
      perTaskRows.push({
        task_id: task.id,
        article_url: task.article_url,
        kappa: null,
        rater_count: 0,
      })
      continue
    }
    const hiddenLookup: Record<
      string,
      { hidden_model?: string; hidden_mode?: string }
    > = {}
    for (const s of task.summaries) {
      hiddenLookup[s.label] = {
        hidden_model: s.hidden_model,
        hidden_mode: s.hidden_mode,
      }
    }
    const rankings = taskResponses.map((r) => r.ranking)
    const aggs = aggregateRankings(rankings, hiddenLookup)
    const kappa =
      rankings.length >= 2 ? fleissKappaFromRankings(rankings) : Number.NaN
    const kappaClean = Number.isFinite(kappa) ? kappa : null
    if (kappaClean !== null) taskKappas.push(kappaClean)

    perTaskRows.push({
      task_id: task.id,
      article_url: task.article_url,
      kappa: kappaClean,
      rater_count: rankings.length,
    })

    for (const a of aggs) {
      const approach = approachKey(a.hidden_mode ?? null, a.hidden_model ?? null)
      const entry =
        perApproach.get(approach) ??
        {
          rank_sum: 0,
          rank_n: 0,
          win_sum: 0,
          win_n: 0,
          rater_count: 0,
          tasks: new Set<string>(),
        }
      entry.rank_sum += a.avg_rank * a.rater_count
      entry.rank_n += a.rater_count
      entry.win_sum += a.win_rate
      entry.win_n += 1
      entry.rater_count += a.rater_count
      entry.tasks.add(task.id)
      perApproach.set(approach, entry)
    }
  }

  const per_approach: AxisCEntry[] = []
  for (const [approach, e] of perApproach) {
    per_approach.push({
      approach,
      rater_count: e.rater_count,
      avg_rank: e.rank_n > 0 ? e.rank_sum / e.rank_n : 0,
      win_rate: e.win_n > 0 ? e.win_sum / e.win_n : 0,
      task_count: e.tasks.size,
    })
  }
  per_approach.sort((a, b) => a.avg_rank - b.avg_rank)

  const pooled_kappa = taskKappas.length > 0 ? meanOrNull(taskKappas) : null
  return { per_approach, per_task: perTaskRows, pooled_kappa }
}

// ─── Markdown rendering ────────────────────────────────────────────────────

function renderAxisA(entries: AxisAEntry[]): string {
  const lines: string[] = []
  lines.push("## Axis A — Content Retention")
  lines.push("")
  lines.push(
    "Overlap metrics computed against the source article (not a human reference summary). " +
      "Higher = more grounded in the source. See methodology caveat in `metrics_system_PRD.md` §2.1.",
  )
  lines.push("")
  if (entries.length === 0) {
    lines.push("_(no rows in window)_")
    lines.push("")
    return lines.join("\n")
  }
  lines.push("| Approach (mode \\| model) | n | ROUGE-1 | ROUGE-L | BLEU | BERTScore | Compression % |")
  lines.push("|---|---|---|---|---|---|---|")
  for (const e of entries) {
    lines.push(
      `| ${e.approach} | ${e.n} | ${fmt(e.rouge1, 4)} | ${fmt(e.rougeL, 4)} | ${fmt(
        e.bleu,
        4,
      )} | ${fmt(e.bert, 4)} | ${fmt(e.compression, 2)} |`,
    )
  }
  lines.push("")
  return lines.join("\n")
}

function renderAxisB1(entries: AxisBRubricEntry[]): string {
  const lines: string[] = []
  lines.push("### B.1 LLM-Judge rubric (FLASK-derived, 1–5 per dimension)")
  lines.push("")
  if (entries.length === 0) {
    lines.push("_(no rubric scores in window)_")
    lines.push("")
    return lines.join("\n")
  }
  lines.push(
    "| Approach (mode \\| model) | n | Faithfulness | Coverage | Fluency | Conciseness | Overall |",
  )
  lines.push("|---|---|---|---|---|---|---|")
  for (const e of entries) {
    lines.push(
      `| ${e.approach} | ${e.n} | ${fmt(e.faithfulness, 2)} | ${fmt(
        e.coverage,
        2,
      )} | ${fmt(e.fluency, 2)} | ${fmt(e.conciseness, 2)} | ${fmt(e.overall, 2)} |`,
    )
  }
  lines.push("")
  return lines.join("\n")
}

function renderAxisB2(entries: AxisB2Entry[]): string {
  const lines: string[] = []
  lines.push("### B.2 LLM-Judge pairwise (fusion runs)")
  lines.push("")
  if (entries.length === 0) {
    lines.push("_(no pairwise verdicts in window)_")
    lines.push("")
    return lines.join("\n")
  }
  lines.push("| Pair | n | A-wins | B-wins | Ties | Winner | Judge model(s) |")
  lines.push("|---|---|---|---|---|---|---|")
  for (const e of entries) {
    lines.push(
      `| ${e.pair} | ${e.n} | ${e.a_wins} | ${e.b_wins} | ${e.ties} | ${e.winner} | ${
        e.judge_models.join(", ") || "—"
      } |`,
    )
  }
  lines.push("")
  return lines.join("\n")
}

function renderAxisB3(entries: AxisB3Entry[]): string {
  const lines: string[] = []
  lines.push("### B.3 Factuality (claim-entailment via gpt-4o-mini)")
  lines.push("")
  if (entries.length === 0) {
    lines.push("_(no factuality scores in window)_")
    lines.push("")
    return lines.join("\n")
  }
  lines.push(
    "| Approach (mode \\| model) | n | Entailment % | Avg hallucinations | Worst case |",
  )
  lines.push("|---|---|---|---|---|")
  for (const e of entries) {
    lines.push(
      `| ${e.approach} | ${e.n} | ${fmt(e.entailment_pct, 1)} | ${fmt(
        e.avg_hallucinations,
        2,
      )} | ${e.worst_case} |`,
    )
  }
  lines.push("")
  return lines.join("\n")
}

function renderAxisC(result: AxisCResult): string {
  const lines: string[] = []
  lines.push("## Axis C — Human Validation")
  lines.push("")
  if (result.per_approach.length === 0) {
    lines.push("_(no human-eval responses in window)_")
    lines.push("")
    return lines.join("\n")
  }
  lines.push(
    `Pooled across ${result.per_task.length} task(s). Avg rank is best→worst (lower = better); ` +
      `win rate is fraction of pairwise comparisons won across all rankings.`,
  )
  lines.push("")
  lines.push(
    "| Approach (mode \\| model) | Tasks | Rater-rankings | Avg rank | Win rate | Pooled Fleiss' κ |",
  )
  lines.push("|---|---|---|---|---|---|")
  const kappaCell = fmt(result.pooled_kappa, 3)
  for (const e of result.per_approach) {
    lines.push(
      `| ${e.approach} | ${e.task_count} | ${e.rater_count} | ${fmt(e.avg_rank, 2)} | ${fmt(
        e.win_rate * 100,
        1,
      )}% | ${kappaCell} |`,
    )
  }
  lines.push("")
  if (result.per_task.length > 0) {
    lines.push("<details><summary>Per-task κ</summary>")
    lines.push("")
    lines.push("| Task | Raters | Fleiss' κ |")
    lines.push("|---|---|---|")
    for (const t of result.per_task) {
      lines.push(
        `| ${t.article_url} | ${t.rater_count} | ${t.kappa == null ? "—" : t.kappa.toFixed(3)} |`,
      )
    }
    lines.push("")
    lines.push("</details>")
    lines.push("")
  }
  return lines.join("\n")
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(70))
  console.log("UNIFIED THREE-AXIS REPORT GENERATOR")
  console.log("=".repeat(70))
  console.log(`Since:    ${SINCE || "(none)"}`)
  console.log(`Until:    ${UNTIL || "(none)"}`)
  console.log(`Tasks:    ${TASK_IDS.length > 0 ? TASK_IDS.join(", ") : "(all)"}`)
  console.log(`Min runs: ${MIN_RUNS}`)
  console.log(`Output:   ${OUTPUT_PATH}`)
  console.log("=".repeat(70))

  const [evalRows, pairwiseRows, humanEval] = await Promise.all([
    fetchEvalRows(),
    fetchPairwiseRows(),
    fetchHumanEval(),
  ])

  console.log(`evaluation_metrics  rows: ${evalRows.length}`)
  console.log(`llm_judge_pairwise  rows: ${pairwiseRows.length}`)
  console.log(`human_eval_tasks    rows: ${humanEval.tasks.length}`)
  console.log(`human_eval_responses rows: ${humanEval.responses.length}`)

  const axisA = buildAxisA(evalRows)
  const axisB1 = buildAxisB1(evalRows)
  const axisB2 = buildAxisB2(pairwiseRows)
  const axisB3 = buildAxisB3(evalRows)
  const axisC = buildAxisC(humanEval.tasks, humanEval.responses)

  const generatedAt = new Date().toISOString()
  const md: string[] = []
  md.push("# Unified Three-Axis Evaluation Report")
  md.push("")
  md.push(`- **Generated:** ${generatedAt}`)
  if (SINCE) md.push(`- **Since:** ${SINCE}`)
  if (UNTIL) md.push(`- **Until:** ${UNTIL}`)
  md.push(`- **Source:** Supabase (\`evaluation_metrics\`, \`llm_judge_pairwise\`, \`human_eval_*\`)`)
  md.push(
    `- **Coverage:** ${evalRows.length} eval rows · ${pairwiseRows.length} pairwise verdicts · ${humanEval.tasks.length} human-eval task(s) · ${humanEval.responses.length} human ranking(s)`,
  )
  md.push("")
  md.push(renderAxisA(axisA))
  md.push("## Axis B — Quality & Preference")
  md.push("")
  md.push(renderAxisB1(axisB1))
  md.push(renderAxisB2(axisB2))
  md.push(renderAxisB3(axisB3))
  md.push(renderAxisC(axisC))

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })
  fs.writeFileSync(OUTPUT_PATH, md.join("\n"))
  console.log(`Wrote Markdown → ${OUTPUT_PATH}`)

  if (WRITE_JSON) {
    fs.writeFileSync(
      JSON_PATH,
      JSON.stringify(
        {
          generated_at: generatedAt,
          window: { since: SINCE || null, until: UNTIL || null },
          coverage: {
            evaluation_metrics: evalRows.length,
            llm_judge_pairwise: pairwiseRows.length,
            human_eval_tasks: humanEval.tasks.length,
            human_eval_responses: humanEval.responses.length,
          },
          axis_a: axisA,
          axis_b1: axisB1,
          axis_b2: axisB2,
          axis_b3: axisB3,
          axis_c: axisC,
        },
        null,
        2,
      ),
    )
    console.log(`Wrote JSON     → ${JSON_PATH}`)
  }
}

main().catch((err) => {
  console.error("FATAL:", err)
  process.exit(1)
})
