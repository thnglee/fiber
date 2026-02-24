const BERT_SERVICE_URL = 'https://heheeess22-bert-score-service.hf.space';
async function run() {
  const reference = "A".repeat(2000);
  const candidate = "B".repeat(1000);
  const promises = [];
  for (let i = 0; i < 10; i++) {
    promises.push(
      fetch(`${BERT_SERVICE_URL}/calculate-score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference_text: reference, candidate_text: candidate })
      }).then(r => r.ok ? r.json() : r.text()).catch(e => e.message)
    );
  }
  const results = await Promise.all(promises);
  console.log("Success count:", results.filter(r => r.f1_score).length);
  console.log("Error sample:", results.find(r => !r.f1_score));
}
run();
