import { logger } from '@/lib/logger';

const BERT_SERVICE_URL = process.env.BERT_SERVICE_URL;
const BERT_TIMEOUT_MS = 30_000; // 30 s — HF Spaces cold-start can be slow

export interface BertScoreResult {
  f1_score: number;
  model_used: string;
}

/**
 * Calls the HF-hosted BERTScore microservice to compute the F1 score between
 * a reference text and a candidate (generated summary).
 *
 * Returns `null` on any failure so callers can treat BERTScore as optional
 * and never block the main summarization flow.
 */
export async function calculateBertScore(
  referenceText: string,
  candidateText: string,
): Promise<number | null> {
  if (!BERT_SERVICE_URL) {
    logger.addLog('bert', 'config-missing', {
      message: 'BERT_SERVICE_URL is not set — skipping BERTScore calculation',
    });
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BERT_TIMEOUT_MS);

  try {
    const response = await fetch(`${BERT_SERVICE_URL}/calculate-score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reference_text: referenceText,
        candidate_text: candidateText,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.addLog('bert', 'http-error', {
        status: response.status,
        body: errorText.substring(0, 200),
      });
      return null;
    }

    const result: BertScoreResult = await response.json();
    logger.addLog('bert', 'success', {
      f1_score: result.f1_score,
      model_used: result.model_used,
    });
    return result.f1_score;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      logger.addLog('bert', 'timeout', {
        message: `Request exceeded ${BERT_TIMEOUT_MS}ms`,
      });
    } else {
      logger.addLog('bert', 'fetch-error', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
