#!/usr/bin/env node
/**
 * batch-routing-test.mjs
 *
 * Generates 200+ evaluation rows by sending articles through the summarize API
 * with different routing modes and models. This produces comparison data for:
 *   - GPT-4o (baseline)
 *   - ViT5-large (Vietnamese abstractive)
 *   - Auto routing (complexity-based model selection)
 *
 * Each request saves evaluation_metrics + routing_decisions to Supabase automatically.
 *
 * Usage:
 *   node scripts/batch-routing-test.mjs
 *   node scripts/batch-routing-test.mjs --limit 50    # limit URLs per category
 *   node scripts/batch-routing-test.mjs --category 1  # only run category 1 (thoi_su)
 *   node scripts/batch-routing-test.mjs --mode auto    # only run auto mode
 */

import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const API_BASE = 'http://localhost:3000/api/summarize';
const DATASET_DIR = resolve(__dirname, '../../metrics_reports/dataset');
const CONCURRENCY = 1; // sequential to avoid rate limits
const REQUEST_TIMEOUT_MS = 180_000; // 3 min per request
const DELAY_BETWEEN_MS = 2_000; // 2s between requests

// Parse CLI args
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

const LIMIT_PER_CATEGORY = getArg('limit') ? parseInt(getArg('limit')) : null;
const ONLY_CATEGORY = getArg('category'); // e.g. "1" for 1_thoi_su
const ONLY_MODE = getArg('mode'); // e.g. "auto", "forced-gpt4o", "forced-vit5"

// ---------------------------------------------------------------------------
// Test configurations — each generates a separate row per article
// ---------------------------------------------------------------------------
const TEST_CONFIGS = [
  {
    name: 'auto',
    label: 'Auto Routing',
    body: { routing_mode: 'auto', debug: true },
  },
  {
    name: 'forced-gpt4o',
    label: 'GPT-4o (forced)',
    body: { model: 'gpt-4o', routing_mode: 'forced', debug: true },
  },
  {
    name: 'forced-gpt4o-mini',
    label: 'GPT-4o Mini (forced)',
    body: { model: 'gpt-4o-mini', routing_mode: 'forced', debug: true },
  },
].filter(c => !ONLY_MODE || c.name === ONLY_MODE);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function callSummarize(url, extraBody) {
  const payload = { url, ...extraBody };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return { ok: false, status: res.status, error: txt.substring(0, 200) };
    }

    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    clearTimeout(timeout);
    return { ok: false, error: err.message };
  }
}

function loadDatasetUrls() {
  const files = readdirSync(DATASET_DIR)
    .filter(f => f.endsWith('.csv'))
    .sort();

  const datasets = [];
  for (const file of files) {
    const categoryNum = file.split('_')[0];
    if (ONLY_CATEGORY && categoryNum !== ONLY_CATEGORY) continue;

    const content = readFileSync(resolve(DATASET_DIR, file), 'utf8');
    const lines = content.trim().split('\n').slice(1); // skip header
    let urls = lines.map(l => l.trim()).filter(l => l.startsWith('http'));

    if (LIMIT_PER_CATEGORY) {
      urls = urls.slice(0, LIMIT_PER_CATEGORY);
    }

    const categoryName = file.replace('.csv', '');
    datasets.push({ category: categoryName, urls });
  }

  return datasets;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const datasets = loadDatasetUrls();
  const totalUrls = datasets.reduce((sum, d) => sum + d.urls.length, 0);
  const totalRequests = totalUrls * TEST_CONFIGS.length;

  console.log('='.repeat(80));
  console.log('BATCH ROUTING TEST — Multi-Model Comparison Data Generator');
  console.log('='.repeat(80));
  console.log(`API:        ${API_BASE}`);
  console.log(`Categories: ${datasets.map(d => d.category).join(', ')}`);
  console.log(`URLs:       ${totalUrls} total`);
  console.log(`Modes:      ${TEST_CONFIGS.map(c => c.label).join(', ')}`);
  console.log(`Requests:   ${totalRequests} total (each saves to Supabase)`);
  console.log(`Est. time:  ~${Math.ceil(totalRequests * 15 / 60)} min (at ~15s/request avg)`);
  console.log('='.repeat(80));
  console.log();

  const stats = {
    total: 0,
    success: 0,
    failed: 0,
    byMode: {},
    byCategory: {},
  };
  for (const c of TEST_CONFIGS) stats.byMode[c.name] = { success: 0, failed: 0 };

  let requestNum = 0;
  const startTimeAll = Date.now();

  for (const dataset of datasets) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Category: ${dataset.category} (${dataset.urls.length} URLs)`);
    console.log(`${'─'.repeat(60)}`);

    if (!stats.byCategory[dataset.category]) {
      stats.byCategory[dataset.category] = { success: 0, failed: 0 };
    }

    for (let i = 0; i < dataset.urls.length; i++) {
      const url = dataset.urls[i];

      for (const config of TEST_CONFIGS) {
        requestNum++;
        const pct = ((requestNum / totalRequests) * 100).toFixed(1);
        const elapsed = ((Date.now() - startTimeAll) / 1000).toFixed(0);
        const eta = requestNum > 1
          ? Math.ceil(((Date.now() - startTimeAll) / requestNum) * (totalRequests - requestNum) / 1000 / 60)
          : '?';

        process.stdout.write(
          `  [${requestNum}/${totalRequests}] (${pct}%, ${elapsed}s, ETA ~${eta}min) ` +
          `${config.label} | ${dataset.category}/${i + 1} … `
        );

        stats.total++;
        const t0 = Date.now();
        const result = await callSummarize(url, config.body);
        const dur = ((Date.now() - t0) / 1000).toFixed(1);

        if (result.ok) {
          stats.success++;
          stats.byMode[config.name].success++;
          stats.byCategory[dataset.category].success++;

          const summary = result.data.summary?.substring(0, 50) || '(no summary)';
          const model = result.data.routing?.selected_model || result.data.model || '?';
          console.log(`✅ ${dur}s [${model}] "${summary}…"`);
        } else {
          stats.failed++;
          stats.byMode[config.name].failed++;
          stats.byCategory[dataset.category].failed++;

          console.log(`❌ ${dur}s — ${result.error?.substring(0, 80) || `HTTP ${result.status}`}`);
        }

        await sleep(DELAY_BETWEEN_MS);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  const totalTime = ((Date.now() - startTimeAll) / 1000 / 60).toFixed(1);

  console.log('\n' + '='.repeat(80));
  console.log('BATCH TEST COMPLETE');
  console.log('='.repeat(80));
  console.log(`Total requests:  ${stats.total}`);
  console.log(`Success:         ${stats.success}`);
  console.log(`Failed:          ${stats.failed}`);
  console.log(`Success rate:    ${((stats.success / stats.total) * 100).toFixed(1)}%`);
  console.log(`Total time:      ${totalTime} min`);
  console.log();

  console.log('By mode:');
  for (const [mode, s] of Object.entries(stats.byMode)) {
    console.log(`  ${mode.padEnd(20)} ✅ ${s.success}  ❌ ${s.failed}`);
  }

  console.log('\nBy category:');
  for (const [cat, s] of Object.entries(stats.byCategory)) {
    console.log(`  ${cat.padEnd(20)} ✅ ${s.success}  ❌ ${s.failed}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('All metrics saved to Supabase evaluation_metrics table automatically.');
  console.log('Check the metrics dashboard or query Supabase directly.');
  console.log('='.repeat(80));
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err);
  process.exit(1);
});
