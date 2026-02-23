/**
 * test-bert-service.mjs
 * Sends 10 Vietnamese article/summary pairs to the BERTScore microservice
 * and prints a results table.
 *
 * Run: node scripts/test-bert-service.mjs
 */

const BERT_SERVICE_URL = 'https://heheeess22-bert-score-service.hf.space';
const ENDPOINT = `${BERT_SERVICE_URL}/calculate-score`;
const TIMEOUT_MS = 60_000; // 60s — give HF cold-start time

// ---------------------------------------------------------------------------
// 10 sample Vietnamese articles + their summaries
// (short excerpts so the test runs quickly)
// ---------------------------------------------------------------------------
const TEST_CASES = [
  {
    id: 1,
    label: 'Kinh tế Việt Nam 2024',
    reference: `Kinh tế Việt Nam năm 2024 ghi nhận mức tăng trưởng GDP đạt 7,09%, cao hơn mục tiêu đề ra và thuộc nhóm tăng trưởng cao nhất châu Á. Xuất khẩu đạt kỷ lục 405 tỷ USD, thặng dư thương mại khoảng 24 tỷ USD. Vốn FDI thực hiện đạt 25,35 tỷ USD, mức cao nhất trong 5 năm gần đây.`,
    candidate: `Kinh tế Việt Nam năm 2024 tăng trưởng 7,09%, xuất khẩu đạt 405 tỷ USD và FDI thực hiện đạt 25,35 tỷ USD.`,
  },
  {
    id: 2,
    label: 'Công nghệ AI tại Việt Nam',
    reference: `Trí tuệ nhân tạo đang được ứng dụng rộng rãi tại Việt Nam trong các lĩnh vực y tế, giáo dục và tài chính. Chính phủ đã ban hành chiến lược quốc gia về AI đến năm 2030, với mục tiêu đưa Việt Nam vào top 4 ASEAN về năng lực AI. Nhiều startup AI Việt Nam đã nhận được vốn đầu tư từ các quỹ quốc tế.`,
    candidate: `Việt Nam đẩy mạnh ứng dụng AI trong nhiều lĩnh vực, với chiến lược quốc gia đến 2030 nhằm lọt top 4 ASEAN về AI.`,
  },
  {
    id: 3,
    label: 'Biến đổi khí hậu',
    reference: `Biến đổi khí hậu đang gây ra các hiện tượng thời tiết cực đoan ngày càng thường xuyên hơn tại Việt Nam. Mực nước biển dâng đe dọa vùng đồng bằng sông Cửu Long, nơi sinh sống của hàng triệu người. Chính phủ cam kết đạt mức phát thải ròng bằng 0 vào năm 2050.`,
    candidate: `Biến đổi khí hậu đe dọa Việt Nam với thời tiết cực đoan và nước biển dâng. Chính phủ cam kết trung hòa carbon vào 2050.`,
  },
  {
    id: 4,
    label: 'Giáo dục đại học',
    reference: `Hệ thống giáo dục đại học Việt Nam đang trải qua giai đoạn cải cách toàn diện với việc áp dụng mô hình tự chủ đại học. Các trường đại học hàng đầu như Đại học Quốc gia Hà Nội và TP.HCM đã lên bảng xếp hạng châu Á. Học phí đại học có xu hướng tăng theo lộ trình tự chủ tài chính.`,
    candidate: `Giáo dục đại học Việt Nam cải cách theo hướng tự chủ, các trường top đầu vươn lên bảng xếp hạng châu Á dù học phí tăng.`,
  },
  {
    id: 5,
    label: 'Du lịch phục hồi',
    reference: `Ngành du lịch Việt Nam phục hồi mạnh mẽ sau đại dịch COVID-19, đón hơn 17,5 triệu lượt khách quốc tế năm 2024. Các điểm đến như Hà Nội, Đà Nẵng, Hội An và Phú Quốc tiếp tục thu hút du khách. Doanh thu du lịch ước đạt 840 nghìn tỷ đồng.`,
    candidate: `Du lịch Việt Nam đón 17,5 triệu khách quốc tế năm 2024, doanh thu đạt 840 nghìn tỷ đồng, phục hồi mạnh sau COVID-19.`,
  },
  {
    id: 6,
    label: 'Thị trường bất động sản',
    reference: `Thị trường bất động sản Việt Nam năm 2024 trải qua giai đoạn khó khăn với thanh khoản thấp và nhiều doanh nghiệp địa ốc gặp áp lực tài chính. Chính phủ đã ban hành nhiều chính sách tháo gỡ khó khăn, trong đó có việc sửa đổi Luật Đất đai. Phân khúc nhà ở xã hội được chú trọng phát triển để đáp ứng nhu cầu nhà ở cho người thu nhập thấp.`,
    candidate: `Bất động sản Việt Nam 2024 gặp khó với thanh khoản thấp. Chính phủ sửa Luật Đất đai và đẩy mạnh nhà ở xã hội.`,
  },
  {
    id: 7,
    label: 'Y tế và sức khỏe cộng đồng',
    reference: `Hệ thống y tế Việt Nam đang được đầu tư nâng cấp với mục tiêu giảm tải cho bệnh viện tuyến trên. Bảo hiểm y tế toàn dân đạt tỷ lệ bao phủ hơn 93% dân số. Các bệnh không lây nhiễm như tim mạch, tiểu đường, ung thư ngày càng gia tăng và trở thành thách thức lớn của ngành y tế.`,
    candidate: `Y tế Việt Nam cải thiện với bảo hiểm y tế bao phủ 93% dân số, nhưng đối mặt thách thức từ các bệnh không lây nhiễm ngày càng tăng.`,
  },
  {
    id: 8,
    label: 'Chuyển đổi số quốc gia',
    reference: `Chương trình chuyển đổi số quốc gia đến năm 2025 của Việt Nam đang được triển khai tích cực với mục tiêu phát triển kinh tế số chiếm 20% GDP. Chính phủ điện tử, thương mại điện tử và thanh toán không dùng tiền mặt đạt nhiều tiến bộ. Hạ tầng viễn thông 5G đang được triển khai tại các thành phố lớn.`,
    candidate: `Việt Nam đẩy nhanh chuyển đổi số với mục tiêu kinh tế số đạt 20% GDP, triển khai 5G và thúc đẩy thanh toán không tiền mặt.`,
  },
  {
    id: 9,
    label: 'Nông nghiệp và an ninh lương thực',
    reference: `Việt Nam là một trong những nước xuất khẩu gạo, cà phê, hạt tiêu và thủy sản hàng đầu thế giới. Ngành nông nghiệp đang chuyển dịch theo hướng nông nghiệp công nghệ cao và hữu cơ. Kim ngạch xuất khẩu nông lâm thủy sản năm 2024 ước đạt 62 tỷ USD.`,
    candidate: `Xuất khẩu nông lâm thủy sản Việt Nam đạt 62 tỷ USD năm 2024, ngành chuyển dịch sang nông nghiệp công nghệ cao và hữu cơ.`,
  },
  {
    id: 10,
    label: 'Giao thông và hạ tầng',
    reference: `Việt Nam đang đẩy mạnh đầu tư vào hạ tầng giao thông với nhiều dự án đường cao tốc Bắc - Nam được hoàn thành. Tuyến đường sắt tốc độ cao Hà Nội - TP.HCM đã được Quốc hội thông qua chủ trương đầu tư với tổng mức vốn khoảng 67 tỷ USD. Hệ thống metro tại Hà Nội và TP.HCM đang được xây dựng và mở rộng.`,
    candidate: `Việt Nam đầu tư mạnh vào hạ tầng giao thông, thông xe nhiều đoạn cao tốc Bắc-Nam, phê duyệt đường sắt tốc độ cao 67 tỷ USD.`,
  },
];

// ---------------------------------------------------------------------------
// Helper: call BERT endpoint with timeout
// ---------------------------------------------------------------------------
async function fetchBertScore(reference, candidate) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference_text: reference, candidate_text: candidate }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`HTTP ${res.status}: ${txt.substring(0, 120)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\n🔗 BERT Service: ${BERT_SERVICE_URL}`);
  console.log(`📋 Running ${TEST_CASES.length} test cases…\n`);

  // First, health-check
  try {
    const hc = await fetch(`${BERT_SERVICE_URL}/healthz`, { signal: AbortSignal.timeout(15_000) });
    const hcJson = await hc.json();
    console.log(`✅ Health check:`, hcJson, '\n');
  } catch (e) {
    console.warn(`⚠️  Health check failed (service may be cold-starting): ${e.message}\n`);
  }

  const results = [];
  let passed = 0;
  let failed = 0;

  for (const tc of TEST_CASES) {
    process.stdout.write(`  [${tc.id}/10] ${tc.label} … `);
    const t0 = Date.now();
    try {
      const data = await fetchBertScore(tc.reference, tc.candidate);
      const elapsed = Date.now() - t0;
      results.push({ id: tc.id, label: tc.label, f1: data.f1_score, model: data.model_used, ms: elapsed, status: 'OK' });
      console.log(`✅  F1=${data.f1_score.toFixed(4)}  (${elapsed}ms)`);
      passed++;
    } catch (err) {
      const elapsed = Date.now() - t0;
      results.push({ id: tc.id, label: tc.label, f1: null, model: null, ms: elapsed, status: `FAIL: ${err.message}` });
      console.log(`❌  ${err.message}`);
      failed++;
    }
  }

  // Summary table
  console.log('\n' + '─'.repeat(80));
  console.log(' RESULTS SUMMARY');
  console.log('─'.repeat(80));
  console.log(` ${'#'.padEnd(3)} ${'Label'.padEnd(32)} ${'F1 Score'.padStart(10)} ${'Time'.padStart(8)}  Status`);
  console.log('─'.repeat(80));
  for (const r of results) {
    const f1 = r.f1 != null ? r.f1.toFixed(4) : '  N/A  ';
    const ms = `${r.ms}ms`;
    console.log(` ${String(r.id).padEnd(3)} ${r.label.padEnd(32)} ${f1.toString().padStart(10)} ${ms.padStart(8)}  ${r.status}`);
  }
  console.log('─'.repeat(80));

  const scores = results.filter(r => r.f1 != null).map(r => r.f1);
  if (scores.length > 0) {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    console.log(`\n📊 Stats  avg=${avg.toFixed(4)}  min=${min.toFixed(4)}  max=${max.toFixed(4)}`);
  }
  console.log(`\n✅ Passed: ${passed}  ❌ Failed: ${failed}\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
