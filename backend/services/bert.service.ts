import { logger } from '@/lib/logger';

const BERT_SERVICE_URL = process.env.BERT_SERVICE_URL;
// HF Spaces free tier can cold-start in 30-60 seconds — use a generous timeout.
const BERT_TIMEOUT_MS = 90_000; // 90 s to cover full cold-start
const BERT_WARMUP_TIMEOUT_MS = 70_000; // 70 s for the pre-warm healthcheck ping

// Truncation limits to keep payloads manageable for the HF Spaces BERT endpoint.
// Vietnamese news articles can be 10 k+ characters — sending the full text caused
// consistent timeouts and >413 errors on the free-tier HF service.
const MAX_REFERENCE_CHARS = 2000;
const MAX_CANDIDATE_CHARS = 1000;

/**
 * Pings the /healthz endpoint to wake up a sleeping HF Space before the
 * main score call. This prevents the 30 s cold-start from eating into the
 * scoring timeout and causing the score to be dropped as null.
 *
 * Returns true if the space responded healthy, false otherwise.
 */
async function warmUpBertService(): Promise<boolean> {
  if (!BERT_SERVICE_URL) return false;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BERT_WARMUP_TIMEOUT_MS);
  try {
    const res = await fetch(`${BERT_SERVICE_URL}/healthz`, {
      method: 'GET',
      signal: controller.signal,
    });
    const healthy = res.ok;
    if (healthy) {
      logger.addLog('bert', 'warmup-ok', { status: res.status });
    } else {
      logger.addLog('bert', 'warmup-unhealthy', { status: res.status });
    }
    return healthy;
  } catch (err) {
    logger.addLog('bert', 'warmup-failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

export interface BertScoreResult {
  f1_score: number;
  model_used: string;
}

/**
 * Calls the HF-hosted BERTScore microservice to compute the F1 score between
 * a reference text and a candidate (generated summary).
 *
 * Both texts are truncated to keep the payload within limits that the free-tier
 * HF Spaces endpoint can reliably handle within the 30 s timeout.
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

  // Wake up the HF Space if it is sleeping (free-tier spaces sleep after ~5 min of
  // inactivity and can take 30-60 s to cold-start). By pinging /healthz first we
  // ensure the space is fully loaded before we send the scoring payload. If the
  // ping itself times out, the score call below will fail fast with an abort error
  // and return null — which is acceptable since without this the score was always null.
  await warmUpBertService();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BERT_TIMEOUT_MS);

  // Truncate texts to stay within safe payload limits
  const truncatedReference = referenceText.length > MAX_REFERENCE_CHARS
    ? referenceText.substring(0, MAX_REFERENCE_CHARS)
    : referenceText;
  const truncatedCandidate = candidateText.length > MAX_CANDIDATE_CHARS
    ? candidateText.substring(0, MAX_CANDIDATE_CHARS)
    : candidateText;

  if (referenceText.length > MAX_REFERENCE_CHARS || candidateText.length > MAX_CANDIDATE_CHARS) {
    logger.addLog('bert', 'truncated', {
      originalReferenceLen: referenceText.length,
      truncatedReferenceLen: truncatedReference.length,
      originalCandidateLen: candidateText.length,
      truncatedCandidateLen: truncatedCandidate.length,
    });
  }

  try {
    const response = await fetch(`${BERT_SERVICE_URL}/calculate-score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reference_text: truncatedReference,
        candidate_text: truncatedCandidate,
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
