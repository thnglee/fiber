#!/usr/bin/env node
/**
 * fill_results.mjs
 * Pulls evaluation_metrics from Supabase and fills the results CSVs.
 * Creates per-model result files: results/{category}_{model}.csv
 * Also creates a combined comparison CSV.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load backend .env
const envPath = resolve(__dirname, '../backend/.env');
const envContent = readFileSync(envPath, 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  let val = trimmed.slice(eqIdx + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
    val = val.slice(1, -1);
  env[key] = val;
}

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL'] || env['SUPABASE_URL'];
const SUPABASE_KEY = env['SUPABASE_SERVICE_ROLE_KEY'];
const DATASET_DIR = resolve(__dirname, 'dataset');
const RESULTS_DIR = resolve(__dirname, 'results');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

async function fetchMetrics() {
  // Fetch all recent metrics with URLs
  const url = `${SUPABASE_URL}/rest/v1/evaluation_metrics?select=url,model,rouge_1,rouge_2,rouge_l,bleu,bert_score,latency,compression_rate,total_tokens&created_at=gt.2026-03-20&url=not.is.null&order=url.asc,model.asc&limit=1000`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase error: ${res.status}`);
  return res.json();
}

function loadDatasetUrls(filename) {
  const content = readFileSync(resolve(DATASET_DIR, filename), 'utf8');
  return content.trim().split('\n').slice(1).map(l => l.trim()).filter(l => l.startsWith('http'));
}

function modelShortName(model) {
  if (model?.includes('vit5')) return 'vit5';
  if (model?.includes('gpt-4o-mini')) return 'gpt4o-mini';
  if (model?.includes('gpt-4o')) return 'gpt4o';
  if (model?.includes('PhoGPT')) return 'phogpt';
  return model || 'unknown';
}

function fmt(val) {
  if (val == null || val === '') return '';
  return typeof val === 'number' ? val.toFixed(4) : String(val);
}

async function main() {
  console.log('Fetching metrics from Supabase...');
  const rows = await fetchMetrics();
  console.log(`Fetched ${rows.length} rows`);

  // Index by url+model
  const byUrlModel = {};
  for (const r of rows) {
    const key = `${r.url}|||${r.model}`;
    byUrlModel[key] = r;
  }

  // Also index by url only (best model = highest bert_score)
  const bestByUrl = {};
  for (const r of rows) {
    if (!bestByUrl[r.url] || (r.bert_score || 0) > (bestByUrl[r.url].bert_score || 0)) {
      bestByUrl[r.url] = r;
    }
  }

  // Get unique models
  const models = [...new Set(rows.map(r => r.model))].sort();
  console.log(`Models found: ${models.map(m => modelShortName(m)).join(', ')}`);

  mkdirSync(RESULTS_DIR, { recursive: true });

  const datasets = readdirSync(DATASET_DIR).filter(f => f.endsWith('.csv')).sort();
  const HEADER = 'URL,ROUGE-1,ROUGE-2,ROUGE-L,BLEU,BERTSCORE,LATENCY,COMPRESSION RATE,TOTAL TOKENS';
  const HEADER_WITH_MODEL = 'URL,MODEL,ROUGE-1,ROUGE-2,ROUGE-L,BLEU,BERTSCORE,LATENCY,COMPRESSION RATE,TOTAL TOKENS';

  // 1. Fill original result CSVs with best-model data
  for (const file of datasets) {
    const urls = loadDatasetUrls(file);
    const lines = [HEADER];
    let filled = 0;

    for (const url of urls) {
      const r = bestByUrl[url];
      if (r) {
        lines.push([url, fmt(r.rouge_1), fmt(r.rouge_2), fmt(r.rouge_l), fmt(r.bleu), fmt(r.bert_score), r.latency || '', fmt(r.compression_rate), r.total_tokens || ''].join(','));
        filled++;
      } else {
        lines.push([url, '', '', '', '', '', '', '', ''].join(','));
      }
    }

    writeFileSync(resolve(RESULTS_DIR, file), lines.join('\n') + '\n');
    console.log(`  ${file}: ${filled}/${urls.length} URLs filled (best model)`);
  }

  // 2. Create per-model result CSVs
  for (const model of models) {
    const shortName = modelShortName(model);

    for (const file of datasets) {
      const catName = file.replace('.csv', '');
      const urls = loadDatasetUrls(file);
      const lines = [HEADER];
      let filled = 0;

      for (const url of urls) {
        const key = `${url}|||${model}`;
        const r = byUrlModel[key];
        if (r) {
          lines.push([url, fmt(r.rouge_1), fmt(r.rouge_2), fmt(r.rouge_l), fmt(r.bleu), fmt(r.bert_score), r.latency || '', fmt(r.compression_rate), r.total_tokens || ''].join(','));
          filled++;
        } else {
          lines.push([url, '', '', '', '', '', '', '', ''].join(','));
        }
      }

      const outFile = `${catName}_${shortName}.csv`;
      writeFileSync(resolve(RESULTS_DIR, outFile), lines.join('\n') + '\n');
      console.log(`  ${outFile}: ${filled}/${urls.length} URLs filled`);
    }
  }

  // 3. Create combined comparison CSV (all models side by side)
  const compLines = [HEADER_WITH_MODEL];
  for (const file of datasets) {
    const urls = loadDatasetUrls(file);
    for (const url of urls) {
      for (const model of models) {
        const key = `${url}|||${model}`;
        const r = byUrlModel[key];
        if (r) {
          compLines.push([url, modelShortName(model), fmt(r.rouge_1), fmt(r.rouge_2), fmt(r.rouge_l), fmt(r.bleu), fmt(r.bert_score), r.latency || '', fmt(r.compression_rate), r.total_tokens || ''].join(','));
        }
      }
    }
  }
  writeFileSync(resolve(RESULTS_DIR, 'comparison_all_models.csv'), compLines.join('\n') + '\n');
  console.log(`\n  comparison_all_models.csv: ${compLines.length - 1} rows total`);

  // 4. Print summary table
  console.log('\n' + '='.repeat(90));
  console.log('MODEL COMPARISON SUMMARY');
  console.log('='.repeat(90));
  console.log(`${'Model'.padEnd(22)} ${'N'.padStart(4)} ${'ROUGE-1'.padStart(9)} ${'ROUGE-2'.padStart(9)} ${'ROUGE-L'.padStart(9)} ${'BLEU'.padStart(8)} ${'BERT'.padStart(8)} ${'Latency'.padStart(9)} ${'Compr%'.padStart(8)}`);
  console.log('-'.repeat(90));

  for (const model of models) {
    const modelRows = rows.filter(r => r.model === model);
    const n = modelRows.length;
    const avg = (field) => {
      const vals = modelRows.map(r => r[field]).filter(v => v != null);
      return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    };
    const f = (v) => v != null ? v.toFixed(4) : 'N/A';

    console.log(
      `${modelShortName(model).padEnd(22)} ${String(n).padStart(4)} ` +
      `${f(avg('rouge_1')).padStart(9)} ${f(avg('rouge_2')).padStart(9)} ${f(avg('rouge_l')).padStart(9)} ` +
      `${f(avg('bleu')).padStart(8)} ${f(avg('bert_score')).padStart(8)} ` +
      `${(avg('latency') ? Math.round(avg('latency')) + 'ms' : 'N/A').padStart(9)} ` +
      `${f(avg('compression_rate')).padStart(8)}`
    );
  }
  console.log('='.repeat(90));
}

main().catch(err => { console.error(err); process.exit(1); });
