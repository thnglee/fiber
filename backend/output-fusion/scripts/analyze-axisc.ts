#!/usr/bin/env tsx
/**
 * analyze-axisc.ts
 *
 * Pulls human_eval_responses + their tasks, joins each ranked label back to
 * its hidden_model/hidden_mode, and reports per-approach win rate (rank 1),
 * mean rank, head-to-head pairwise win counts, and sign-test p-values for
 * the thesis-decisive comparisons.
 *
 * Usage:
 *   cd backend
 *   npx tsx output-fusion/scripts/analyze-axisc.ts
 */

import * as path from "node:path"
import { config as loadDotenv } from "dotenv"
loadDotenv({ path: path.resolve(__dirname, "../../.env") })

import { createClient } from "@supabase/supabase-js"
import { signTestPValue, fleissKappaFromRankings } from "./stats"

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!url || !key) {
  console.error("Missing Supabase env")
  process.exit(1)
}
const supabase = createClient(url, key, { auth: { persistSession: false } })

interface Summary {
  label: string
  hidden_model?: string
  hidden_mode?: string
}
interface TaskRow {
  id: string
  article_url: string
  notes: string | null
  summaries: Summary[]
}
interface ResponseRow {
  id: string
  task_id: string
  rater_id: string
  ranking: string[]
  rationale: Record<string, string>
  created_at: string
}

// Map (model, mode) → coarse approach bucket so cross-task aggregation works.
function approachOf(s: Summary): string {
  const mode = s.hidden_mode ?? ""
  const model = (s.hidden_model ?? "").toLowerCase()
  if (mode === "fusion" || model.startsWith("moa:")) return "fused"
  if (mode === "proposer_draft") return "proposer_draft:" + model
  if (mode === "sync") {
    if (model.includes("mini")) return "single:gpt-4o-mini"
    if (model.startsWith("gpt-4o")) return "single:gpt-4o"
    return "single:" + model
  }
  return `${mode}:${model}`
}

async function main() {
  const { data: tasksRaw, error: tErr } = await supabase
    .from("human_eval_tasks")
    .select("id, article_url, notes, summaries")
  if (tErr) throw new Error(`tasks: ${tErr.message}`)

  const { data: respRaw, error: rErr } = await supabase
    .from("human_eval_responses")
    .select("id, task_id, rater_id, ranking, rationale, created_at")
    .order("created_at", { ascending: true })
  if (rErr) throw new Error(`responses: ${rErr.message}`)

  const tasks: TaskRow[] = (tasksRaw ?? []).map((t) => ({
    id: t.id,
    article_url: t.article_url,
    notes: t.notes,
    summaries: t.summaries as Summary[],
  }))
  const responses: ResponseRow[] = (respRaw ?? []) as ResponseRow[]
  const tasksById = new Map(tasks.map((t) => [t.id, t]))

  console.log("\n========================================")
  console.log("Axis C — Human Evaluation Report")
  console.log("========================================\n")
  console.log(`Tasks total:       ${tasks.length}`)
  console.log(`Responses total:   ${responses.length}`)

  if (responses.length === 0) {
    console.log("\nNo responses submitted yet. Nothing to analyze.\n")
    return
  }

  // ── Coverage stats ─────────────────────────────────────────────
  const respByTask = new Map<string, ResponseRow[]>()
  const raterIds = new Set<string>()
  for (const r of responses) {
    if (!respByTask.has(r.task_id)) respByTask.set(r.task_id, [])
    respByTask.get(r.task_id)!.push(r)
    raterIds.add(r.rater_id)
  }
  const tasksWithResponses = respByTask.size
  const tasksWithMultipleRaters = [...respByTask.values()].filter(
    (v) => new Set(v.map((r) => r.rater_id)).size >= 2,
  ).length

  console.log(`Unique raters:     ${raterIds.size}  (${[...raterIds].join(", ")})`)
  console.log(`Tasks rated:       ${tasksWithResponses}/${tasks.length}`)
  console.log(`Tasks ≥2 raters:   ${tasksWithMultipleRaters} (Fleiss κ eligible)`)

  // ── Per-rater progress ─────────────────────────────────────────
  console.log(`\nPer-rater progress:`)
  const perRater = new Map<string, number>()
  for (const r of responses) {
    perRater.set(r.rater_id, (perRater.get(r.rater_id) ?? 0) + 1)
  }
  for (const [rid, n] of [...perRater.entries()].sort()) {
    console.log(`  ${rid.padEnd(30)} ${n} response(s)`)
  }

  // ── Per-approach aggregation across all responses ──────────────
  // For each response, look up the approach for each label, find which
  // approach is at rank 1, 2, 3, etc.
  interface ApproachStats {
    rank1: number
    rank2: number
    rank3: number
    appearances: number
    rankSum: number
  }
  const approaches = new Map<string, ApproachStats>()
  function bump(a: string, rank: number) {
    if (!approaches.has(a))
      approaches.set(a, { rank1: 0, rank2: 0, rank3: 0, appearances: 0, rankSum: 0 })
    const s = approaches.get(a)!
    s.appearances++
    s.rankSum += rank
    if (rank === 1) s.rank1++
    else if (rank === 2) s.rank2++
    else if (rank === 3) s.rank3++
  }

  // ── Pairwise comparisons (head-to-head from rankings) ──────────
  interface PairwiseStats {
    aWins: number
    bWins: number
    ties: number
  }
  function pairKey(a: string, b: string) {
    return a < b ? `${a} vs ${b}` : `${b} vs ${a}`
  }
  const pairwise = new Map<string, PairwiseStats>()
  // Per-rater sign-test inputs for fused-vs-single specifically
  const fusedVsSingle: number[] = [] // +1 fused better, -1 single better, 0 tie
  const fusedVsMini: number[] = []

  for (const resp of responses) {
    const task = tasksById.get(resp.task_id)
    if (!task) continue
    const labelToApproach = new Map(
      task.summaries.map((s) => [s.label, approachOf(s)]),
    )
    const labelToRank = new Map(resp.ranking.map((label, i) => [label, i + 1]))

    for (const [label, rank] of labelToRank) {
      const a = labelToApproach.get(label)
      if (a) bump(a, rank)
    }

    const labels = resp.ranking
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const a = labelToApproach.get(labels[i])
        const b = labelToApproach.get(labels[j])
        if (!a || !b || a === b) continue
        const key = pairKey(a, b)
        if (!pairwise.has(key)) pairwise.set(key, { aWins: 0, bWins: 0, ties: 0 })
        const s = pairwise.get(key)!
        // labels[i] is ranked higher (better) than labels[j]
        if (a < b) s.aWins++
        else s.bWins++
      }
    }

    // Direct fused-vs-single sign test
    let rankFused: number | undefined
    let rankSingle: number | undefined
    let rankMini: number | undefined
    for (const [label, rank] of labelToRank) {
      const ap = labelToApproach.get(label)
      if (ap === "fused") rankFused = rank
      else if (ap === "single:gpt-4o") rankSingle = rank
      else if (ap?.startsWith("proposer_draft:gpt-4o-mini") || ap === "single:gpt-4o-mini")
        rankMini = rank
    }
    if (rankFused != null && rankSingle != null) {
      fusedVsSingle.push(rankFused < rankSingle ? 1 : rankFused > rankSingle ? -1 : 0)
    }
    if (rankFused != null && rankMini != null) {
      fusedVsMini.push(rankFused < rankMini ? 1 : rankFused > rankMini ? -1 : 0)
    }
  }

  // ── Print per-approach stats ───────────────────────────────────
  console.log(`\nPer-approach stats (across all ${responses.length} ranked responses):\n`)
  console.log(
    "Approach".padEnd(35) +
      "n".padStart(6) +
      "  rank1     rank2     rank3     mean-rank  win-rate(rank1)",
  )
  console.log("-".repeat(100))
  const sorted = [...approaches.entries()].sort(
    (a, b) => a[1].rankSum / a[1].appearances - b[1].rankSum / b[1].appearances,
  )
  for (const [a, s] of sorted) {
    const meanRank = s.appearances === 0 ? 0 : s.rankSum / s.appearances
    const winRate = s.appearances === 0 ? 0 : (s.rank1 / s.appearances) * 100
    console.log(
      a.padEnd(35) +
        String(s.appearances).padStart(6) +
        "  " +
        String(s.rank1).padStart(8) +
        "  " +
        String(s.rank2).padStart(8) +
        "  " +
        String(s.rank3).padStart(8) +
        "  " +
        meanRank.toFixed(3).padStart(9) +
        "  " +
        (winRate.toFixed(1) + "%").padStart(10),
    )
  }

  // ── Print pairwise wins ────────────────────────────────────────
  console.log(`\nHead-to-head pairwise wins (derived from each rater's ranking):\n`)
  console.log("Pair".padEnd(70) + "  A wins   B wins   total")
  console.log("-".repeat(100))
  for (const [pair, s] of [...pairwise.entries()].sort()) {
    const total = s.aWins + s.bWins + s.ties
    console.log(
      pair.padEnd(70) +
        "  " +
        String(s.aWins).padStart(6) +
        "  " +
        String(s.bWins).padStart(6) +
        "  " +
        String(total).padStart(6),
    )
  }

  // ── Sign tests for thesis-decisive comparisons ─────────────────
  function summarize(label: string, samples: number[]) {
    if (samples.length === 0) {
      console.log(`  ${label}: n=0 (no data)`)
      return
    }
    const fusedBetter = samples.filter((s) => s === 1).length
    const otherBetter = samples.filter((s) => s === -1).length
    const ties = samples.filter((s) => s === 0).length
    const decisive = fusedBetter + otherBetter
    const winRate = decisive === 0 ? 0 : (fusedBetter / decisive) * 100
    const p = decisive === 0 ? null : signTestPValue(fusedBetter, decisive)
    console.log(
      `  ${label}: fused ${fusedBetter} / other ${otherBetter} / tie ${ties} (n=${samples.length}, decisive=${decisive}) → ${winRate.toFixed(1)}%${
        p == null ? "" : `, p = ${p.toFixed(4)}`
      }`,
    )
  }

  console.log(`\nSign-test verdicts (analogous to the LLM-judge pairwise on Axis B):`)
  summarize("fused vs gpt-4o-alone (mirrors B.2c, target was 77.1%)", fusedVsSingle)
  summarize("fused vs gpt-4o-mini draft (mirrors one B.2b row)", fusedVsMini)

  // ── Fleiss κ on tasks with ≥2 raters ───────────────────────────
  const overlapTasks = [...respByTask.entries()].filter(
    ([, rs]) => new Set(rs.map((r) => r.rater_id)).size >= 2,
  )
  if (overlapTasks.length === 0) {
    console.log(`\nFleiss' κ: not computable (no task has ≥2 distinct raters yet)`)
  } else {
    // Pool rankings across overlapping tasks. Each task contributes one row of
    // K labels — but we want per-approach κ, so map labels → approach first.
    // (κ is computed in label-space, but since we randomize labels per task,
    // the labels themselves are arbitrary positions. Use approach instead.)
    const allRankings: string[][] = []
    for (const [taskId, rs] of overlapTasks) {
      const task = tasksById.get(taskId)
      if (!task) continue
      const labelToApproach = new Map(
        task.summaries.map((s) => [s.label, approachOf(s)]),
      )
      for (const r of rs) {
        const approachRanking = r.ranking.map(
          (l) => labelToApproach.get(l) ?? l,
        )
        allRankings.push(approachRanking)
      }
    }
    let kappa: number | null = null
    try {
      kappa = fleissKappaFromRankings(allRankings)
    } catch (e) {
      console.log(`\nFleiss' κ failed: ${e}`)
    }
    if (kappa != null) {
      console.log(
        `\nFleiss' κ (n=${overlapTasks.length} overlap tasks, ${allRankings.length} ranking rows): ${kappa.toFixed(3)}`,
      )
      console.log(
        `  Landis-Koch bands: <0.0 poor / 0.0–0.2 slight / 0.21–0.4 fair / 0.41–0.6 moderate / 0.61–0.8 substantial / 0.81–1.0 almost perfect`,
      )
    }
  }

  // ── Per-rater × per-approach breakdown ─────────────────────────
  console.log(`\nPer-rater × approach (mean rank, lower = better):`)
  console.log("Rater".padEnd(30) + "  fused   single:gpt-4o  proposer:mini    n")
  console.log("-".repeat(85))
  for (const rid of [...new Set(responses.map((r) => r.rater_id))].sort()) {
    const rs = responses.filter((r) => r.rater_id === rid)
    const sums = { fused: 0, single: 0, mini: 0 }
    const cnts = { fused: 0, single: 0, mini: 0 }
    for (const r of rs) {
      const task = tasksById.get(r.task_id)
      if (!task) continue
      const labelToApproach = new Map(
        task.summaries.map((s) => [s.label, approachOf(s)]),
      )
      r.ranking.forEach((label, idx) => {
        const a = labelToApproach.get(label)
        const rank = idx + 1
        if (a === "fused") {
          sums.fused += rank
          cnts.fused++
        } else if (a === "single:gpt-4o") {
          sums.single += rank
          cnts.single++
        } else if (a?.startsWith("proposer_draft:gpt-4o-mini")) {
          sums.mini += rank
          cnts.mini++
        }
      })
    }
    const mean = (s: number, c: number) => (c === 0 ? "-" : (s / c).toFixed(2))
    console.log(
      rid.padEnd(30) +
        "  " +
        mean(sums.fused, cnts.fused).padStart(5) +
        "          " +
        mean(sums.single, cnts.single).padStart(5) +
        "          " +
        mean(sums.mini, cnts.mini).padStart(5) +
        "      " +
        String(rs.length).padStart(3),
    )
  }

  // ── Suspected duplicate rater IDs ─────────────────────────────
  console.log(`\nSuspected duplicate rater IDs (likely same person, multiple submissions):`)
  const ids = [...new Set(responses.map((r) => r.rater_id))]
  function normalize(s: string) {
    return s
      .toLowerCase()
      .replace(/[<3♥💕🙂\s]+/g, "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
  }
  const groups = new Map<string, string[]>()
  for (const id of ids) {
    const k = normalize(id)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(id)
  }
  for (const [k, vs] of groups) {
    if (vs.length > 1) {
      console.log(`  "${k}" matches: ${vs.map((v) => `"${v}"`).join(", ")}`)
    }
  }

  // ── Tasks with ≥2 distinct raters listed ──────────────────────
  console.log(`\nTasks with ≥2 distinct raters (κ-eligible after rater-id cleanup):`)
  for (const [taskId, rs] of overlapTasks) {
    const task = tasksById.get(taskId)
    const distinct = new Set(rs.map((r) => r.rater_id))
    console.log(`  ${taskId}  (${task?.notes ?? "?"})  raters: ${[...distinct].join(", ")}`)
  }

  console.log("\n========================================\n")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
