import { encode } from "gpt-tokenizer";

// ─── Custom Error ────────────────────────────────────────────────────────────

/**
 * Thrown when the original text is empty, undefined, or tokenises to 0 tokens,
 * which would cause a division-by-zero in the compression rate formula.
 */
export class EmptyOriginalTextError extends Error {
  constructor(
    message = "Original text must be a non-empty string with at least 1 token.",
  ) {
    super(message);
    this.name = "EmptyOriginalTextError";
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CompressionRateInput {
  /** The full, original article / document text. */
  originalText: string;
  /** The generated summary text to compare against the original. */
  summaryText: string;
}

export interface CompressionRateResult {
  /** Token count of the original text (cl100k_base encoding). */
  originalTokens: number;
  /** Token count of the summary text (cl100k_base encoding). */
  summaryTokens: number;
  /**
   * Compression rate as a percentage, rounded to 2 decimal places.
   * Formula: (summaryTokens / originalTokens) * 100
   *
   * A value of 100 means the summary is the same length as the original.
   * Values below 100 indicate compression (e.g. 20 = summary is 20% of the original).
   */
  compressionRate: number;
}

// ─── Core Function ───────────────────────────────────────────────────────────

/**
 * Counts the number of tokens in a string using the cl100k_base encoding
 * (the same encoding used by GPT-3.5-Turbo and GPT-4 models).
 *
 * @param text - The text to tokenise.
 * @returns The number of tokens.
 */
function countTokens(text: string): number {
  return encode(text).length;
}

/**
 * Calculates the Compression Rate of a generated summary relative to the
 * original text, measured in tokens (cl100k_base encoding).
 *
 * **Formula:**
 * ```
 * Compression Rate = (Summary Tokens / Original Tokens) × 100
 * ```
 *
 * @param input - Object containing `originalText` and `summaryText`.
 * @returns {@link CompressionRateResult} with raw token counts and the rounded rate.
 * @throws {EmptyOriginalTextError} If `originalText` is empty, whitespace-only, or
 *   tokenises to zero tokens — preventing a division-by-zero.
 *
 * @example
 * ```ts
 * const result = calculateCompressionRate({
 *   originalText: 'The quick brown fox jumps over the lazy dog.',
 *   summaryText:  'A fox jumps over a dog.',
 * });
 * // result.compressionRate → e.g. 57.14
 * ```
 */
export function calculateCompressionRate(
  input: CompressionRateInput,
): CompressionRateResult {
  const { originalText, summaryText } = input;

  // ── Guard: original text must be a non-empty string ─────────────────────
  if (!originalText || originalText.trim().length === 0) {
    throw new EmptyOriginalTextError(
      "originalText is empty or undefined. Cannot calculate compression rate.",
    );
  }

  const originalTokens = countTokens(originalText);

  // ── Guard: original must tokenise to at least 1 token ───────────────────
  if (originalTokens === 0) {
    throw new EmptyOriginalTextError(
      `originalText produced 0 tokens after encoding. Cannot calculate compression rate.`,
    );
  }

  // An empty / undefined summary is valid — it simply results in a 0% rate.
  const summaryTokens = summaryText ? countTokens(summaryText) : 0;

  const rawRate = (summaryTokens / originalTokens) * 100;
  const compressionRate = parseFloat(rawRate.toFixed(2));

  return {
    originalTokens,
    summaryTokens,
    compressionRate,
  };
}
