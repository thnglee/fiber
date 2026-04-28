import React from 'react';
import type { JudgePairwiseDimensions, JudgeVerdict } from '@/domain/schemas';

/**
 * JudgePairwiseBadge — small pill summarizing an AlpacaEval-style pairwise verdict.
 *
 * Maps {A, B, tie} to the semantically meaningful labels using the row's own
 * `summary_a_label` / `summary_b_label` (so we can support fused-vs-best-draft
 * comparisons regardless of which side the judge saw first).
 *
 * Tooltip lists the per-dimension breakdown ("faithfulness: A · coverage: tie · ...").
 */

export interface PairwiseRow {
  winner: JudgeVerdict | string;
  summary_a_label: string;
  summary_b_label: string;
  per_dimension?: JudgePairwiseDimensions | Record<string, string> | null;
  justification?: string | null;
  length_note?: string | null;
  position_swapped?: boolean | null;
}

interface JudgePairwiseBadgeProps {
  pairwise: PairwiseRow | null | undefined;
  /**
   * Optional hint: if provided, the side matching this label is rendered as
   * "Fused wins"/"Best-draft wins" (vs the generic "<label> wins"). Defaults to
   * the literal A/B label.
   */
  preferredSideLabel?: string;
  className?: string;
}

const DIMENSION_KEYS = ['faithfulness', 'coverage', 'fluency', 'conciseness'] as const;

function verdictToLabel(
  winner: string,
  summaryALabel: string,
  summaryBLabel: string,
): { text: string; tone: 'win-a' | 'win-b' | 'tie' } {
  if (winner === 'tie') return { text: 'Tie', tone: 'tie' };
  if (winner === 'A') return { text: `${labelize(summaryALabel)} wins`, tone: 'win-a' };
  if (winner === 'B') return { text: `${labelize(summaryBLabel)} wins`, tone: 'win-b' };
  return { text: 'Unknown', tone: 'tie' };
}

function labelize(raw: string): string {
  if (!raw) return 'Unknown';
  if (raw === 'fused') return 'Fused';
  if (raw.startsWith('best_draft')) return 'Best-draft';
  // Fall through: title-case the raw label
  return raw
    .split(/[_:]/)
    .map((s) => (s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s))
    .join(' ');
}

function toneClasses(tone: 'win-a' | 'win-b' | 'tie', isFusedSide: boolean): string {
  // When the winning side is "fused" (the label we care about for the thesis),
  // render green; "best-draft wins" → amber; tie → gray.
  if (tone === 'tie') return 'bg-gray-100 text-gray-700 border-gray-200';
  if (isFusedSide) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
}

export function JudgePairwiseBadge({
  pairwise,
  preferredSideLabel = 'fused',
  className = '',
}: JudgePairwiseBadgeProps) {
  if (!pairwise) {
    return <span className={`text-xs text-gray-400 ${className}`}>--</span>;
  }

  const { winner, summary_a_label, summary_b_label, per_dimension, justification, length_note } = pairwise;
  const { text, tone } = verdictToLabel(winner, summary_a_label, summary_b_label);

  const winningLabelRaw =
    winner === 'A' ? summary_a_label : winner === 'B' ? summary_b_label : null;
  const isFusedSide =
    winningLabelRaw != null && winningLabelRaw === preferredSideLabel;

  // Per-dimension tooltip: "faithfulness: A · coverage: tie · ..."
  const dimSummary = (() => {
    if (!per_dimension) return '';
    const parts: string[] = [];
    for (const key of DIMENSION_KEYS) {
      const v = (per_dimension as Record<string, string>)[key];
      if (typeof v === 'string') parts.push(`${key}: ${v}`);
    }
    return parts.join(' · ');
  })();

  const tooltip = [
    `Verdict: ${text}`,
    `A = ${summary_a_label} | B = ${summary_b_label}`,
    dimSummary && `Per-dimension: ${dimSummary}`,
    length_note && `Length note: ${length_note}`,
    justification && `Justification: ${justification.slice(0, 240)}${justification.length > 240 ? '…' : ''}`,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <span
      title={tooltip}
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-semibold ${toneClasses(tone, isFusedSide)} ${className}`}
    >
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${
          tone === 'tie'
            ? 'bg-gray-400'
            : isFusedSide
              ? 'bg-emerald-500'
              : 'bg-amber-500'
        }`}
        aria-hidden="true"
      />
      {text}
    </span>
  );
}

/**
 * JudgePairwiseDimensionTable — verbose breakdown rendered next to the badge in
 * detail views (Fusion tab, Debug page). Shows each of the 4 sub-dimensions and
 * which side won. Read-only.
 */
export function JudgePairwiseDimensionTable({
  pairwise,
  className = '',
}: {
  pairwise: PairwiseRow | null | undefined;
  className?: string;
}) {
  if (!pairwise || !pairwise.per_dimension) return null;
  const dims = pairwise.per_dimension as Record<string, string>;

  return (
    <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 ${className}`}>
      {DIMENSION_KEYS.map((key) => {
        const v = dims[key];
        const tone =
          v === 'A'
            ? 'bg-blue-50 text-blue-700 border-blue-200'
            : v === 'B'
              ? 'bg-purple-50 text-purple-700 border-purple-200'
              : 'bg-gray-50 text-gray-600 border-gray-200';
        return (
          <div
            key={key}
            className={`rounded-md border px-2 py-1.5 text-xs ${tone}`}
          >
            <p className="text-[10px] uppercase tracking-wider opacity-75">{key}</p>
            <p className="font-semibold mt-0.5">
              {v === 'A'
                ? labelize(pairwise.summary_a_label)
                : v === 'B'
                  ? labelize(pairwise.summary_b_label)
                  : v === 'tie'
                    ? 'Tie'
                    : '--'}
            </p>
          </div>
        );
      })}
    </div>
  );
}
