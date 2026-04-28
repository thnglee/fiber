import React from 'react';
import type { JudgeRubricScores } from '@/domain/schemas';

/**
 * JudgeRubricWidget — compact 5-axis visualization for FLASK-derived rubric scores.
 *
 * Renders four sub-dimensions (faithfulness, coverage, fluency, conciseness) as 1–5
 * horizontal bars and the overall score as a prominent badge. Pure CSS — no chart
 * library needed.
 *
 * Pass `compact` for table-cell rendering (smaller bars, tighter spacing).
 *
 * Tolerates missing/null dimensions: any non-finite score renders as a dashed
 * placeholder bar so partial rubrics still display.
 */

type RubricInput = Partial<JudgeRubricScores> | null | undefined;

const DIMENSIONS: Array<{
  key: keyof JudgeRubricScores;
  label: string;
}> = [
  { key: 'faithfulness', label: 'Faithfulness' },
  { key: 'coverage', label: 'Coverage' },
  { key: 'fluency', label: 'Fluency' },
  { key: 'conciseness', label: 'Conciseness' },
];

function scoreColor(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return 'bg-gray-200';
  if (score >= 4.5) return 'bg-emerald-500';
  if (score >= 3.5) return 'bg-green-500';
  if (score >= 2.5) return 'bg-amber-500';
  if (score >= 1.5) return 'bg-orange-500';
  return 'bg-red-500';
}

function overallTextColor(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return 'text-gray-400';
  if (score >= 4) return 'text-emerald-700';
  if (score >= 3) return 'text-green-700';
  if (score >= 2) return 'text-amber-700';
  return 'text-red-700';
}

function clampPct(score: number | null | undefined): number {
  if (score == null || !Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, (score / 5) * 100));
}

interface JudgeRubricWidgetProps {
  rubric: RubricInput;
  compact?: boolean;
  className?: string;
}

export function JudgeRubricWidget({ rubric, compact = false, className = '' }: JudgeRubricWidgetProps) {
  if (!rubric) {
    return (
      <span className={`text-xs text-gray-400 ${className}`}>No judge data</span>
    );
  }

  const overall = typeof rubric.overall === 'number' && Number.isFinite(rubric.overall)
    ? rubric.overall
    : null;

  if (compact) {
    return (
      <div className={`inline-flex items-center gap-2 ${className}`}>
        {/* Overall badge */}
        <span
          className={`inline-flex items-center justify-center min-w-[2.25rem] h-7 px-2 rounded-md border border-gray-200 bg-white text-sm font-semibold ${overallTextColor(overall)}`}
          title={overall != null ? `Overall: ${overall.toFixed(1)} / 5` : 'Overall: --'}
        >
          {overall != null ? overall.toFixed(1) : '--'}
        </span>
        {/* Mini bars (one per dimension) */}
        <div className="flex items-end gap-0.5 h-5" aria-hidden="true">
          {DIMENSIONS.map(({ key, label }) => {
            const score = rubric[key];
            const pct = clampPct(typeof score === 'number' ? score : null);
            const valid = typeof score === 'number' && Number.isFinite(score);
            return (
              <span
                key={key}
                title={`${label}: ${valid ? `${score.toFixed(1)} / 5` : '--'}`}
                className={`block w-1.5 ${valid ? scoreColor(score as number) : 'bg-gray-200'} rounded-sm`}
                style={{ height: `${Math.max(pct, 8)}%` }}
              />
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-gray-200 bg-white p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
          LLM-Judge Rubric
        </span>
        <span className="inline-flex items-baseline gap-1">
          <span className={`text-2xl font-bold ${overallTextColor(overall)}`}>
            {overall != null ? overall.toFixed(1) : '--'}
          </span>
          <span className="text-xs text-gray-400">/ 5 overall</span>
        </span>
      </div>

      <div className="space-y-2">
        {DIMENSIONS.map(({ key, label }) => {
          const score = rubric[key];
          const valid = typeof score === 'number' && Number.isFinite(score);
          const pct = clampPct(valid ? (score as number) : null);
          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs text-gray-600">{label}</span>
                <span className="text-xs font-semibold text-gray-800">
                  {valid ? `${(score as number).toFixed(1)}` : '--'}
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full ${valid ? scoreColor(score as number) : 'bg-gray-200'}`}
                  style={{ width: `${Math.max(pct, valid ? 4 : 0)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * JudgeAbsoluteBadge — single MT-Bench-style 1–10 score for the "absolute" judge style.
 * Tiny inline pill; intended to replace the rubric widget when style === 'absolute'.
 */
export function JudgeAbsoluteBadge({
  score,
  className = '',
}: {
  score: number | null | undefined;
  className?: string;
}) {
  const valid = typeof score === 'number' && Number.isFinite(score);
  const colorClass = !valid
    ? 'bg-gray-100 text-gray-500 border-gray-200'
    : score! >= 8
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : score! >= 6
        ? 'bg-green-50 text-green-700 border-green-200'
        : score! >= 4
          ? 'bg-amber-50 text-amber-700 border-amber-200'
          : 'bg-red-50 text-red-700 border-red-200';

  return (
    <span
      className={`inline-flex items-baseline gap-1 px-2.5 py-1 rounded-md border text-sm font-semibold ${colorClass} ${className}`}
      title={valid ? `LLM-Judge absolute score: ${score!.toFixed(1)} / 10` : 'No judge score'}
    >
      <span>{valid ? score!.toFixed(1) : '--'}</span>
      <span className="text-[10px] font-normal opacity-70">/ 10</span>
    </span>
  );
}
