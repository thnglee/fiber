#!/usr/bin/env tsx
/**
 * Evaluation Mode Batch Test Script
 *
 * Runs 50 articles (10 per category) through evaluation mode to gather
 * model comparison metrics. Each article is summarized by all candidate
 * models in parallel, scored with BERTScore + ROUGE, and the results
 * are persisted to routing_decisions + model_comparison_results tables.
 *
 * Usage:
 *   npm run test:evaluation
 *   npm run test:evaluation -- --concurrency 1 --per-category 5
 */

import * as fs from "fs"
import * as path from "path"

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_BASE_URL = process.env.API_URL || "http://localhost:3000"
const DATASET_DIR = path.resolve(__dirname, "../../metrics_reports/dataset")
const OUTPUT_DIR = path.join(__dirname, "../test-results")

// Parse CLI args
const args = process.argv.slice(2)
function getArg(name: string, fallback: number): number {
  const idx = args.indexOf(`--${name}`)
  if (idx !== -1 && args[idx + 1]) return parseInt(args[idx + 1], 10)
  return fallback
}
const PER_CATEGORY = getArg("per-category", 10)
const CONCURRENCY = getArg("concurrency", 2)
const TIMEOUT_MS = getArg("timeout", 300_000) // 5 min per article

// Category display names
const CATEGORY_NAMES: Record<string, string> = {
  "1_thoi_su": "Thời sự",
  "2_phap_luat": "Pháp luật",
  "3_kinh_te": "Kinh tế",
  "4_giao_duc": "Giáo dục",
  "5_van_hoa": "Văn hóa",
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CandidateResult {
  model_name: string
  bert_score: number | null
  rouge1: number | null
  prompt_tokens: number | null
  completion_tokens: number | null
  estimated_cost_usd: number | null
  latency_ms: number | null
  selected: boolean
}

interface ArticleResult {
  index: number
  url: string
  category_file: string
  category_detected: string
  winner_model: string
  complexity: string
  candidates: CandidateResult[]
  total_latency_ms: number
  error?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadUrls(csvPath: string): string[] {
  const content = fs.readFileSync(csvPath, "utf-8")
  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean)
  // Skip header row
  return lines.slice(1).filter((l) => l.startsWith("http"))
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function processArticle(
  url: string,
  index: number,
  total: number,
  categoryFile: string,
): Promise<ArticleResult> {
  const label = `[${index}/${total}]`
  console.log(`${label} Processing: ${url}`)
  const startTime = Date.now()

  try {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/summarize`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          routing_mode: "evaluation",
          website: new URL(url).hostname,
        }),
      },
      TIMEOUT_MS,
    )

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`HTTP ${response.status}: ${errorBody.slice(0, 200)}`)
    }

    const data = await response.json()
    const totalLatency = Date.now() - startTime

    const candidates: CandidateResult[] = (data.routing?.candidates || []).map(
      (c: Record<string, unknown>) => ({
        model_name: c.model_name as string,
        bert_score: c.bert_score as number | null,
        rouge1: c.rouge1 as number | null,
        prompt_tokens: c.prompt_tokens as number | null,
        completion_tokens: c.completion_tokens as number | null,
        estimated_cost_usd: c.estimated_cost_usd as number | null,
        latency_ms: c.latency_ms as number | null,
        selected: c.selected as boolean,
      }),
    )

    const winner = candidates.find((c) => c.selected)

    console.log(
      `${label} Done in ${(totalLatency / 1000).toFixed(1)}s — winner: ${winner?.model_name || "?"} ` +
        `(BERT: ${winner?.bert_score?.toFixed(4) || "N/A"})`,
    )

    return {
      index,
      url,
      category_file: categoryFile,
      category_detected: data.category || "",
      winner_model: data.routing?.selected_model || data.model || "",
      complexity: data.routing?.complexity || "",
      candidates,
      total_latency_ms: totalLatency,
    }
  } catch (err) {
    const totalLatency = Date.now() - startTime
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error(`${label} FAILED (${(totalLatency / 1000).toFixed(1)}s): ${errorMsg}`)

    return {
      index,
      url,
      category_file: categoryFile,
      category_detected: "",
      winner_model: "",
      complexity: "",
      candidates: [],
      total_latency_ms: totalLatency,
      error: errorMsg,
    }
  }
}

// Semaphore for concurrency control
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < tasks.length) {
      const i = nextIndex++
      results[i] = await tasks[i]()
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker())
  await Promise.all(workers)
  return results
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

interface Stats {
  totalArticles: number
  successCount: number
  failCount: number
  successRate: string
  avgTotalLatency: string
  modelWins: Record<string, number>
  avgBertScoreByModel: Record<string, string>
  avgRouge1ByModel: Record<string, string>
  avgLatencyByModel: Record<string, string>
  avgCostByModel: Record<string, string>
  complexityDistribution: Record<string, number>
}

function calculateStats(results: ArticleResult[]): Stats {
  const successful = results.filter((r) => !r.error)
  const failed = results.filter((r) => r.error)

  // Model win counts
  const modelWins: Record<string, number> = {}
  for (const r of successful) {
    if (r.winner_model) {
      modelWins[r.winner_model] = (modelWins[r.winner_model] || 0) + 1
    }
  }

  // Per-model aggregated scores
  const modelScores: Record<
    string,
    { bert: number[]; rouge1: number[]; latency: number[]; cost: number[] }
  > = {}

  for (const r of successful) {
    for (const c of r.candidates) {
      if (!modelScores[c.model_name]) {
        modelScores[c.model_name] = { bert: [], rouge1: [], latency: [], cost: [] }
      }
      if (c.bert_score != null) modelScores[c.model_name].bert.push(c.bert_score)
      if (c.rouge1 != null) modelScores[c.model_name].rouge1.push(c.rouge1)
      if (c.latency_ms != null) modelScores[c.model_name].latency.push(c.latency_ms)
      if (c.estimated_cost_usd != null) modelScores[c.model_name].cost.push(c.estimated_cost_usd)
    }
  }

  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0)

  const avgBertScoreByModel: Record<string, string> = {}
  const avgRouge1ByModel: Record<string, string> = {}
  const avgLatencyByModel: Record<string, string> = {}
  const avgCostByModel: Record<string, string> = {}

  for (const [model, scores] of Object.entries(modelScores)) {
    avgBertScoreByModel[model] = avg(scores.bert).toFixed(4)
    avgRouge1ByModel[model] = avg(scores.rouge1).toFixed(4)
    avgLatencyByModel[model] = `${Math.round(avg(scores.latency))}ms`
    avgCostByModel[model] = `$${avg(scores.cost).toFixed(6)}`
  }

  // Complexity distribution
  const complexityDistribution: Record<string, number> = {}
  for (const r of successful) {
    if (r.complexity) {
      complexityDistribution[r.complexity] = (complexityDistribution[r.complexity] || 0) + 1
    }
  }

  return {
    totalArticles: results.length,
    successCount: successful.length,
    failCount: failed.length,
    successRate: ((successful.length / results.length) * 100).toFixed(1) + "%",
    avgTotalLatency: (avg(successful.map((r) => r.total_latency_ms)) / 1000).toFixed(1) + "s",
    modelWins,
    avgBertScoreByModel,
    avgRouge1ByModel,
    avgLatencyByModel,
    avgCostByModel,
    complexityDistribution,
  }
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

function generateReport(results: ArticleResult[], stats: Stats): string {
  const lines: string[] = []

  lines.push("# Evaluation Mode Batch Test Results")
  lines.push("")
  lines.push(`**Date:** ${new Date().toLocaleString("vi-VN")}`)
  lines.push(`**Articles tested:** ${stats.totalArticles}`)
  lines.push(`**Success rate:** ${stats.successRate} (${stats.successCount}/${stats.totalArticles})`)
  lines.push(`**Average total latency:** ${stats.avgTotalLatency}`)
  lines.push(`**Concurrency:** ${CONCURRENCY}`)
  lines.push("")

  // Model comparison table
  lines.push("## Model Comparison")
  lines.push("")
  lines.push("| Model | Wins | Avg BERTScore | Avg ROUGE-1 | Avg Latency | Avg Cost |")
  lines.push("|-------|------|---------------|-------------|-------------|----------|")
  const allModels = Object.keys(stats.avgBertScoreByModel)
  for (const model of allModels) {
    lines.push(
      `| ${model} | ${stats.modelWins[model] || 0} | ${stats.avgBertScoreByModel[model]} | ${stats.avgRouge1ByModel[model]} | ${stats.avgLatencyByModel[model]} | ${stats.avgCostByModel[model]} |`,
    )
  }
  lines.push("")

  // Complexity distribution
  lines.push("## Complexity Distribution")
  lines.push("")
  for (const [complexity, count] of Object.entries(stats.complexityDistribution)) {
    lines.push(`- **${complexity}:** ${count} articles`)
  }
  lines.push("")

  // Per-article results table
  lines.push("## Per-Article Results")
  lines.push("")
  lines.push("| # | Category | Complexity | Winner | BERTScore | ROUGE-1 | Latency | Status |")
  lines.push("|---|----------|------------|--------|-----------|---------|---------|--------|")

  for (const r of results) {
    if (r.error) {
      lines.push(`| ${r.index} | ${CATEGORY_NAMES[r.category_file] || r.category_file} | - | - | - | - | ${(r.total_latency_ms / 1000).toFixed(1)}s | FAILED |`)
      continue
    }
    const winner = r.candidates.find((c) => c.selected)
    lines.push(
      `| ${r.index} | ${CATEGORY_NAMES[r.category_file] || r.category_file} | ${r.complexity} | ${r.winner_model} | ${winner?.bert_score?.toFixed(4) || "N/A"} | ${winner?.rouge1?.toFixed(4) || "N/A"} | ${(r.total_latency_ms / 1000).toFixed(1)}s | OK |`,
    )
  }

  // Failed articles
  const failed = results.filter((r) => r.error)
  if (failed.length > 0) {
    lines.push("")
    lines.push("## Failed Articles")
    lines.push("")
    for (const r of failed) {
      lines.push(`- **${r.url}**: ${r.error}`)
    }
  }

  return lines.join("\n")
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

function generateCsv(results: ArticleResult[]): string {
  const headers = [
    "Index",
    "URL",
    "Category File",
    "Category Detected",
    "Complexity",
    "Winner Model",
    "Winner BERTScore",
    "Winner ROUGE-1",
    "Total Latency (ms)",
    "Error",
  ]

  // Add per-model columns dynamically
  const allModels = new Set<string>()
  for (const r of results) {
    for (const c of r.candidates) allModels.add(c.model_name)
  }
  const modelList = [...allModels].sort()
  for (const model of modelList) {
    headers.push(`${model} BERTScore`, `${model} ROUGE-1`, `${model} Latency (ms)`, `${model} Cost ($)`)
  }

  const rows = results.map((r) => {
    const winner = r.candidates.find((c) => c.selected)
    const base = [
      r.index,
      r.url,
      r.category_file,
      r.category_detected,
      r.complexity,
      r.winner_model,
      winner?.bert_score ?? "",
      winner?.rouge1 ?? "",
      r.total_latency_ms,
      r.error || "",
    ]

    for (const model of modelList) {
      const c = r.candidates.find((x) => x.model_name === model)
      base.push(
        c?.bert_score ?? "",
        c?.rouge1 ?? "",
        c?.latency_ms ?? "",
        c?.estimated_cost_usd ?? "",
      )
    }

    return base.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")
  })

  return [headers.map((h) => `"${h}"`).join(","), ...rows].join("\n")
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=".repeat(80))
  console.log("EVALUATION MODE BATCH TEST")
  console.log("=".repeat(80))
  console.log(`API URL:        ${API_BASE_URL}`)
  console.log(`Per category:   ${PER_CATEGORY}`)
  console.log(`Concurrency:    ${CONCURRENCY}`)
  console.log(`Timeout:        ${TIMEOUT_MS / 1000}s per article`)
  console.log(`Dataset dir:    ${DATASET_DIR}`)
  console.log("=".repeat(80))

  // Load datasets
  const datasetFiles = fs
    .readdirSync(DATASET_DIR)
    .filter((f) => f.endsWith(".csv"))
    .sort()

  if (datasetFiles.length === 0) {
    console.error("No dataset CSV files found!")
    process.exit(1)
  }

  // Build task list: pick PER_CATEGORY random URLs from each dataset
  const tasks: { url: string; categoryFile: string }[] = []

  for (const file of datasetFiles) {
    const categoryKey = file.replace(".csv", "")
    const urls = loadUrls(path.join(DATASET_DIR, file))
    // Shuffle and pick
    const shuffled = urls.sort(() => Math.random() - 0.5)
    const selected = shuffled.slice(0, PER_CATEGORY)
    console.log(`  ${CATEGORY_NAMES[categoryKey] || categoryKey}: ${selected.length} of ${urls.length} URLs selected`)
    for (const url of selected) {
      tasks.push({ url, categoryFile: categoryKey })
    }
  }

  const totalArticles = tasks.length
  console.log(`\nTotal articles to process: ${totalArticles}`)
  console.log("=".repeat(80))

  const startTime = Date.now()

  // Run all tasks with concurrency control
  const taskFns = tasks.map(
    (t, i) => () => processArticle(t.url, i + 1, totalArticles, t.categoryFile),
  )
  const results = await runWithConcurrency(taskFns, CONCURRENCY)

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(0)

  // Calculate stats
  const stats = calculateStats(results)

  // Print summary
  console.log("\n" + "=".repeat(80))
  console.log("RESULTS SUMMARY")
  console.log("=".repeat(80))
  console.log(`Total time:     ${totalTime}s`)
  console.log(`Success rate:   ${stats.successRate}`)
  console.log(`Avg latency:    ${stats.avgTotalLatency}`)
  console.log("")
  console.log("Model wins:")
  for (const [model, wins] of Object.entries(stats.modelWins)) {
    console.log(`  ${model}: ${wins} wins (${((wins / stats.successCount) * 100).toFixed(1)}%)`)
  }
  console.log("")
  console.log("Average BERTScore by model:")
  for (const [model, score] of Object.entries(stats.avgBertScoreByModel)) {
    console.log(`  ${model}: ${score}`)
  }
  console.log("")
  console.log("Average ROUGE-1 by model:")
  for (const [model, score] of Object.entries(stats.avgRouge1ByModel)) {
    console.log(`  ${model}: ${score}`)
  }
  console.log("")
  console.log("Average cost by model:")
  for (const [model, cost] of Object.entries(stats.avgCostByModel)) {
    console.log(`  ${model}: ${cost}`)
  }
  console.log("=".repeat(80))

  // Save results
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")

  // JSON
  const jsonPath = path.join(OUTPUT_DIR, `evaluation-batch-${timestamp}.json`)
  fs.writeFileSync(jsonPath, JSON.stringify({ results, stats, config: { PER_CATEGORY, CONCURRENCY, TIMEOUT_MS } }, null, 2))
  console.log(`\nJSON saved:     ${jsonPath}`)

  // CSV
  const csvPath = path.join(OUTPUT_DIR, `evaluation-batch-${timestamp}.csv`)
  fs.writeFileSync(csvPath, generateCsv(results))
  console.log(`CSV saved:      ${csvPath}`)

  // Markdown
  const mdPath = path.join(OUTPUT_DIR, `evaluation-batch-${timestamp}.md`)
  fs.writeFileSync(mdPath, generateReport(results, stats))
  console.log(`Report saved:   ${mdPath}`)

  console.log("\nDone!")
}

main().catch((err) => {
  console.error("\nFatal error:", err)
  process.exit(1)
})
