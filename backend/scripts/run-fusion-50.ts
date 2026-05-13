#!/usr/bin/env tsx
import * as fs from "fs"
import * as path from "path"

const API_BASE_URL = process.env.API_URL || "http://localhost:3000"
const DATASET_DIR = path.resolve(__dirname, "../../metrics_reports/dataset")
const OUTPUT_DIR = path.resolve(__dirname, "../../fusion_reports/results")

const PER_CATEGORY = 6 // 30 articles total
const TIMEOUT_MS = 300_000

function loadUrls(csvPath: string): string[] {
  const content = fs.readFileSync(csvPath, "utf-8")
  return content.split("\n").map((l) => l.trim()).filter(l => l.startsWith("http"))
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function main() {
  console.log("Loading previous processed URLs...")
  const processedUrls = new Set<string>()
  const outputFiles = fs.readdirSync(OUTPUT_DIR)
  for (const f of outputFiles) {
    if (f.endsWith(".json")) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, f), "utf8"))
        if (data.records) {
          for (const r of data.records) processedUrls.add(r.url)
        }
        if (data.results) {
          for (const r of data.results) processedUrls.add(r.url)
        }
      } catch (e) {}
    }
  }

  const datasetFiles = fs.readdirSync(DATASET_DIR).filter((f) => f.endsWith(".csv")).sort()
  const tasks: { url: string; categoryFile: string }[] = []

  for (const file of datasetFiles) {
    const categoryKey = file.replace(".csv", "")
    const urls = loadUrls(path.join(DATASET_DIR, file))
    const freshUrls = urls.filter(u => !processedUrls.has(u))
    const shuffled = freshUrls.sort(() => Math.random() - 0.5)
    const selected = shuffled.slice(0, PER_CATEGORY)
    console.log(`  ${categoryKey}: ${selected.length} URLs selected (out of ${freshUrls.length} fresh)`)
    for (const url of selected) {
      tasks.push({ url, categoryFile: categoryKey })
    }
  }

  console.log(`\nTotal articles to process: ${tasks.length}\n`)

  const results: any[] = []
  
  let index = 0;
  for (const t of tasks) {
    index++
    console.log(`[${index}/${tasks.length}] Processing: ${t.url}`)
    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/api/summarize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: t.url,
            routing_mode: "fusion",
            website: new URL(t.url).hostname,
            fusion_config: {
              proposerModels: ["claude-haiku-4-5", "gpt-4o-mini", "gemini-2.5-flash"]
            }
          }),
        },
        TIMEOUT_MS,
      )

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${await response.text()}`)
      }
      const data = await response.json()
      console.log(`  Success! Mode: ${data.routing?.mode || "fusion"}`)
      results.push({ url: t.url, category: t.categoryFile, success: true, data })
    } catch (err: any) {
      console.error(`  FAILED: ${err.message}`)
      results.push({ url: t.url, category: t.categoryFile, success: false, error: err.message })
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const jsonPath = path.join(OUTPUT_DIR, `fusion-batch-30-${timestamp}.json`)
  fs.writeFileSync(jsonPath, JSON.stringify({ results }, null, 2))
  console.log(`\nResults saved to ${jsonPath}`)
}

main().catch(console.error)
