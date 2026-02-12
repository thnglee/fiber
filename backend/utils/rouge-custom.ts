import natural from 'natural';

// Tokenizer to split text into words
const tokenizer = new natural.WordTokenizer();

/**
 * Generates n-grams from a list of tokens.
 * @param tokens Array of tokens strings.
 * @param n N-gram size.
 * @returns Array of n-gram strings.
 */
function getNGrams(tokens: string[], n: number): string[] {
  if (tokens.length < n) return [];
  const ngrams: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    ngrams.push(tokens.slice(i, i + n).join(' '));
  }
  return ngrams;
}

/**
 * Calculates ROUGE-N score (Recall).
 * @param candidate Summary text.
 * @param reference Original text.
 * @param n N-gram size (1 for Unigram, 2 for Bigram).
 * @returns Score between 0 and 1.
 */
export function rougeN(candidate: string, reference: string, n: number): number {
  const candidateTokens = tokenizer.tokenize(candidate.toLowerCase()) || [];
  const referenceTokens = tokenizer.tokenize(reference.toLowerCase()) || [];

  if (referenceTokens.length === 0) return 0;

  const candidateNGrams = getNGrams(candidateTokens, n);
  const referenceNGrams = getNGrams(referenceTokens, n);

  if (referenceNGrams.length === 0) return 0;

  let overlap = 0;
  const referenceNGramCounts = new Map<string, number>();
  
  for (const ngram of referenceNGrams) {
    referenceNGramCounts.set(ngram, (referenceNGramCounts.get(ngram) || 0) + 1);
  }

  for (const ngram of candidateNGrams) {
    if (referenceNGramCounts.has(ngram) && referenceNGramCounts.get(ngram)! > 0) {
      overlap++;
      referenceNGramCounts.set(ngram, referenceNGramCounts.get(ngram)! - 1);
    }
  }

  // ROUGE-N is usually recall based: overlap / reference_count
  return overlap / referenceNGrams.length;
}

/**
 * calculates Longest Common Subsequence length.
 */
function lcsLength(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp[m][n];
}

/**
 * Calculates ROUGE-L score.
 * @param candidate Summary text.
 * @param reference Original text.
 * @returns Score between 0 and 1.
 */
export function rougeL(candidate: string, reference: string): number {
  const candidateTokens = tokenizer.tokenize(candidate.toLowerCase()) || [];
  const referenceTokens = tokenizer.tokenize(reference.toLowerCase()) || [];

  if (referenceTokens.length === 0) return 0;

  const lcs = lcsLength(candidateTokens, referenceTokens);
  
  // ROUGE-L Recall = LCS / reference_length
  return lcs / referenceTokens.length;
}
