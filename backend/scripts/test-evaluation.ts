import { config } from 'dotenv';
import path from 'path';

// Load environment variables from .env file
config({ path: path.resolve(__dirname, '../.env') });

import { calculateLexicalMetrics, saveEvaluationMetrics } from '../services/evaluation.service';

async function testEvaluation() {
  console.log('Testing Evaluation Metrics...');

  const original = "The quick brown fox jumps over the lazy dog. It was a sunny day in the neighborhood.";
  const summary = "The fox jumps over the dog.";

  console.log(`Original: "${original}"`);
  console.log(`Summary: "${summary}"`);

  try {
    const metrics = calculateLexicalMetrics(summary, original);
    console.log('Metrics Calculated:', metrics);

    if (metrics.rouge1 === undefined || metrics.bleu === undefined) {
      console.error('FAILED: Metrics returned undefined values');
      process.exit(1);
    }
    
    console.log('Saving to Supabase (this will create a record)...');
    await saveEvaluationMetrics({
        summary,
        original,
        url: 'http://test-url.com',
        metrics
    });
    console.log('Saved successfully (check Supabase for record)');

  } catch (error) {
    console.error('Error during test:', error);
    process.exit(1);
  }
}

testEvaluation();
