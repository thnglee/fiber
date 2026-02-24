const BERT_SERVICE_URL = 'https://heheeess22-bert-score-service.hf.space';
async function run() {
  const promises = [];
  for (let i = 0; i < 10; i++) {
    promises.push(
      fetch(`${BERT_SERVICE_URL}/calculate-score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference_text: "test " + i, candidate_text: "test " + i })
      }).then(r => r.ok).catch(e => e.message)
    );
  }
  const results = await Promise.all(promises);
  console.log(results);
}
run();
