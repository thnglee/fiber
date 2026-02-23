/**
 * test-e2e-summarize.mjs
 * Sends 3 Vietnamese articles to the local fiber backend /api/summarize endpoint,
 * waits for BERTScore to be saved (fire-and-forget has ~30s window),
 * then queries Supabase directly to confirm bert_score was stored.
 *
 * Run: node scripts/test-e2e-summarize.mjs
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env manually (no dotenv dependency needed)
const envPath = resolve(__dirname, '../.env');
const envContent = readFileSync(envPath, 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  let val = trimmed.slice(eqIdx + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  env[key] = val;
}

const LOCAL_API = 'http://localhost:3000/api/summarize';
const SUPABASE_URL = env['SUPABASE_URL'];
const SUPABASE_SERVICE_ROLE_KEY = env['SUPABASE_SERVICE_ROLE_KEY'];

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 3 short test articles (inline content, no URL scraping for speed)
// ---------------------------------------------------------------------------
const ARTICLES = [
  {
    label: 'Kinh tế Việt Nam',
    content: `Kinh tế Việt Nam năm 2024 ghi nhận mức tăng trưởng GDP đạt 7,09%, cao hơn mục tiêu đề ra và thuộc nhóm tăng trưởng cao nhất châu Á. Xuất khẩu đạt kỷ lục 405 tỷ USD, thặng dư thương mại khoảng 24 tỷ USD. Vốn FDI thực hiện đạt 25,35 tỷ USD, mức cao nhất trong 5 năm gần đây. Ngành sản xuất điện tử, dệt may và thủy sản tiếp tục là những trụ cột xuất khẩu chính. Chính phủ đặt mục tiêu tăng trưởng GDP năm 2025 đạt trên 7%, tập trung vào đầu tư công và kích cầu tiêu dùng nội địa.`,
  },
  {
    label: 'Trí tuệ nhân tạo',
    content: `Trí tuệ nhân tạo đang thay đổi căn bản nhiều ngành công nghiệp trên toàn cầu. Các mô hình ngôn ngữ lớn như GPT-4 và Gemini đang được tích hợp vào phần mềm văn phòng, y tế, giáo dục và tài chính. Tại Việt Nam, nhiều doanh nghiệp và startup đã bắt đầu ứng dụng AI vào quy trình kinh doanh. Chính phủ ban hành chiến lược quốc gia về AI đến năm 2030, với mục tiêu đưa Việt Nam vào top 4 ASEAN. Đào tạo nhân lực AI và xây dựng hạ tầng dữ liệu là hai ưu tiên hàng đầu trong giai đoạn tới.`,
  },
  {
    label: 'Biến đổi khí hậu',
    content: `Biến đổi khí hậu đang gây ra các hậu quả nghiêm trọng tại nhiều quốc gia, trong đó có Việt Nam. Nhiệt độ trung bình tăng lên, mực nước biển dâng đe dọa các vùng duyên hải và đồng bằng sông Cửu Long. Các hiện tượng thời tiết cực đoan như bão, lũ lụt và hạn hán ngày càng thường xuyên và khốc liệt hơn. Việt Nam cam kết đạt mức phát thải ròng bằng 0 vào năm 2050 tại COP26. Các giải pháp bao gồm phát triển năng lượng tái tạo, trồng rừng và chuyển đổi giao thông xanh.`,
  },
];

// ---------------------------------------------------------------------------
// Helper: call local summarize API (non-streaming mode)
// ---------------------------------------------------------------------------
async function callSummarize(article) {
  const res = await fetch(LOCAL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: article.content }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status}: ${txt.substring(0, 200)}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Helper: query Supabase for the latest N rows (with bert_score)
// ---------------------------------------------------------------------------
async function fetchLatestRows(n) {
  const url = `${SUPABASE_URL}/rest/v1/evaluation_metrics?select=id,created_at,summary_text,rouge_1,bleu,bert_score,latency&order=created_at.desc&limit=${n}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Supabase fetch failed: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\n🚀 Fiber Backend E2E Test`);
  console.log(`📡 POST → ${LOCAL_API}\n`);

  const summaryResults = [];

  // Step 1: send all articles to the backend
  for (let i = 0; i < ARTICLES.length; i++) {
    const article = ARTICLES[i];
    process.stdout.write(`  [${i + 1}/${ARTICLES.length}] Summarizing "${article.label}" … `);
    const t0 = Date.now();
    try {
      const data = await callSummarize(article);
      const elapsed = Date.now() - t0;
      summaryResults.push({ label: article.label, summary: data.summary, elapsed, ok: true });
      console.log(`✅  ${elapsed}ms  →  "${data.summary?.substring(0, 60)}…"`);
    } catch (err) {
      summaryResults.push({ label: article.label, ok: false, error: err.message });
      console.log(`❌  ${err.message}`);
    }
  }

  // Step 2: wait for fire-and-forget BERTScore calls to complete
  // BERTScore takes ~500ms per call, plus network. Give 45s grace period.
  const WAIT_SEC = 45;
  console.log(`\n⏳ Waiting ${WAIT_SEC}s for BERTScore fire-and-forget to complete…`);
  for (let s = WAIT_SEC; s > 0; s -= 5) {
    await new Promise(r => setTimeout(r, 5000));
    process.stdout.write(`   ${s - 5}s remaining…\r`);
  }
  console.log('   Done waiting.                    ');

  // Step 3: fetch latest rows from Supabase
  console.log('\n📦 Fetching latest rows from Supabase evaluation_metrics…\n');
  let rows;
  try {
    rows = await fetchLatestRows(ARTICLES.length + 2);
  } catch (err) {
    console.error(`❌ Could not query Supabase: ${err.message}`);
    process.exit(1);
  }

  // Print table
  console.log('─'.repeat(90));
  console.log(` ${'Created At'.padEnd(22)} ${'Summary (60ch)'.padEnd(62)} ${'BERT'.padStart(6)}`);
  console.log('─'.repeat(90));
  for (const row of rows) {
    const ts = new Date(row.created_at).toLocaleString('vi-VN');
    const summary = (row.summary_text || '').substring(0, 60).padEnd(62);
    const bert = row.bert_score != null ? row.bert_score.toFixed(4) : ' null ';
    const flag = row.bert_score != null ? '✅' : '⚠️ ';
    console.log(` ${flag} ${ts.padEnd(20)} ${summary} ${bert.padStart(6)}`);
  }
  console.log('─'.repeat(90));

  // Summary
  const withBert = rows.filter(r => r.bert_score != null).length;
  const withoutBert = rows.filter(r => r.bert_score == null).length;
  console.log(`\n📊 Of ${rows.length} most recent rows:`);
  console.log(`   ✅ ${withBert} have bert_score populated`);
  if (withoutBert > 0) console.log(`   ⚠️  ${withoutBert} have bert_score = null (may be older rows)`);
  console.log();
}

main().catch(err => { console.error(err); process.exit(1); });
