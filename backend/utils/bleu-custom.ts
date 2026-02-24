import natural from 'natural';

// Tokenizer to split text into words
const tokenizer = new natural.WordTokenizer();

/**
 * Calculates BLEU score with smoothing (method 1).
 * Method 1 smoothing replaces 0 with a small epsilon (like 0.1) for matched counts.
 * This prevents the geometric mean from becoming 0 when higher order n-grams have no matches.
 * 
 * @param reference Original text.
 * @param candidate Summary text.
 * @param maxN The maximum n-gram to consider (typically 4).
 * @returns Score between 0 and 1.
 */
export function bleu(reference: string, candidate: string, maxN: number = 4): number {
  const referenceTokens = tokenizer.tokenize(reference.toLowerCase()) || [];
  const candidateTokens = tokenizer.tokenize(candidate.toLowerCase()) || [];

  if (referenceTokens.length === 0 || candidateTokens.length === 0) return 0;

  // Calculate n-gram precision
  const precision = Array(maxN).fill(0);
  
  for (let n = 1; n <= maxN; n++) {
    const referenceNgrams: Record<string, number> = {};
    const candidateNgrams: Record<string, number> = {};

    for (let i = 0; i <= referenceTokens.length - n; i++) {
        const ngram = referenceTokens.slice(i, i + n).join(' ');
        referenceNgrams[ngram] = (referenceNgrams[ngram] || 0) + 1;
    }

    for (let i = 0; i <= candidateTokens.length - n; i++) {
        const ngram = candidateTokens.slice(i, i + n).join(' ');
        candidateNgrams[ngram] = (candidateNgrams[ngram] || 0) + 1;
    }

    let totalNgramMatches = 0;
    for (const ngram in candidateNgrams) {
        if (ngram in referenceNgrams) {
            // Clipped precision
            totalNgramMatches += Math.min(candidateNgrams[ngram], referenceNgrams[ngram]);
        }
    }

    const totalPredictedNgrams = candidateTokens.length - n + 1;
    
    // Smoothing Method 1: If 0 matches, assume a very small number (epsilon)
    // To avoid the entire score dropping to 0 for short texts
    // Exception: If there are simply no predicted n-grams of this length (text is too short), 
    // it's debated how to handle it, but standard BLEU gives it 0. Due to smoothing, we give small val.
    if (totalPredictedNgrams > 0) {
        if (totalNgramMatches === 0) {
            // Epsilon smoothing for zero counts
            precision[n - 1] = 0.1 / totalPredictedNgrams;
        } else {
            precision[n - 1] = totalNgramMatches / totalPredictedNgrams;
        }
    } else {
        // If candidate is shorter than n, we can't calculate precision for that n.
        // We smooth it with a very small number instead of 0 to not zero out everything.
        precision[n - 1] = 0.1 / (Math.pow(10, n)); 
    }
  }

  // Calculate brevity penalty
  const referenceLength = referenceTokens.length;
  const candidateLength = candidateTokens.length;

  const brevityPenalty = candidateLength > referenceLength 
    ? 1 
    : Math.exp(1 - referenceLength / candidateLength);

  // Calculate BLEU score using geometric mean
  // Log-sum-exp approach is numerically more stable, but direct multiplication with
  // smoothed precisions prevents taking log(0).
  const logSum = precision.reduce((acc, p) => acc + Math.log(p), 0);
  const geometricMean = Math.exp(logSum / maxN);
  
  const bleuScore = brevityPenalty * geometricMean;
  return bleuScore;
}
