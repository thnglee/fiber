import { rougeN, rougeL as calcRougeL } from '@/utils/rouge-custom';
import { bleu } from 'bleu-score';
import { getSupabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export interface EvaluationMetrics {
  rouge1: number;
  rouge2: number;
  rougeL: number;
  bleu: number;
}

export interface EvaluationData {
  summary: string;
  original: string;
  url?: string;
  metrics: EvaluationMetrics;
    created_at?: string;
}

export interface EvaluationResponse {
    data: EvaluationData[];
    count: number;
}

/**
 * Calculates ROUGE and BLEU metrics for a summary against the original text.
 * @param summary The generated summary.
 * @param original The original text.
 * @returns EvaluationMetrics object containing ROUGE-1, ROUGE-2, ROUGE-L, and BLEU scores.
 */
export const calculateLexicalMetrics = (summary: string, original: string): EvaluationMetrics => {
  // 1. ROUGE-N (Using custom implementation)
  
  // Calculate ROUGE-1 (Unigram)
  const rouge1 = rougeN(summary, original, 1);
  
  // Calculate ROUGE-2 (Bigram)
  const rouge2 = rougeN(summary, original, 2);

  // 2. ROUGE-L (Longest Common Subsequence)
  const rougeL = calcRougeL(summary, original);

  // 3. BLEU Score
  // bleu-score expects (reference, candidate, n)
  // It effectively calculates n-gram precision.
  const bleuScore = bleu(original, summary, 4);

  return {
    rouge1: parseFloat(rouge1.toFixed(4)),
    rouge2: parseFloat(rouge2.toFixed(4)),
    rougeL: parseFloat(rougeL.toFixed(4)),
    bleu: parseFloat(bleuScore.toFixed(4)),
  };
};

/**
 * Saves evaluation metrics to Supabase.
 * @param data EvaluationData object containing summary, original text (optional/length), and metrics.
 */
export const saveEvaluationMetrics = async (data: EvaluationData) => {
    const supabase = getSupabaseAdmin();
    try {
        const { error } = await supabase
            .from('evaluation_metrics')
            .insert({
                summary_text: data.summary,
                original_text_length: data.original.length,
                url: data.url,
                rouge_1: data.metrics.rouge1,
                rouge_2: data.metrics.rouge2,
                rouge_l: data.metrics.rougeL,
                bleu: data.metrics.bleu,
                metadata: {
                    original_preview: data.original.substring(0, 200)
                }
            });

        if (error) {
            logger.addLog('evaluation', 'save-error', { error: error.message });
            console.error('Error saving evaluation metrics:', error);
        } else {
            logger.addLog('evaluation', 'saved', { 
                rouge1: data.metrics.rouge1,
                bleu: data.metrics.bleu
            });
        }
    } catch (err) {
        logger.addLog('evaluation', 'save-exception', { error: err instanceof Error ? err.message : String(err) });
        console.error('Exception saving evaluation metrics:', err);
    }
};

/**
 * Fetches evaluation metrics from Supabase with pagination.
 * @param limit Number of records to fetch.
 * @param offset Number of records to skip.
 * @returns Array of EvaluationData and total count.
 */
export const getEvaluationMetrics = async (limit: number = 20, offset: number = 0): Promise<EvaluationResponse> => {
    const supabase = getSupabaseAdmin();
    try {
        const { data, error, count } = await supabase
            .from('evaluation_metrics')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            logger.addLog('evaluation', 'fetch-error', { error: error.message });
            throw error;
        }

        const metricsData: EvaluationData[] = (data || []).map(row => ({
            summary: row.summary_text,
            original: '', // Not fetching full original text to save bandwidth
            url: row.url,
            created_at: row.created_at,
            metrics: {
                rouge1: row.rouge_1,
                rouge2: row.rouge_2,
                rougeL: row.rouge_l,
                bleu: row.bleu
            }
        }));

        return {
            data: metricsData,
            count: count || 0
        };
    } catch (err) {
        logger.addLog('evaluation', 'fetch-exception', { error: err instanceof Error ? err.message : String(err) });
        console.error('Exception fetching evaluation metrics:', err);
        return { data: [], count: 0 };
    }
};
