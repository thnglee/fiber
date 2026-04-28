'use client';

import React, { useState } from 'react';
import { AlertTriangle, ShieldCheck, ShieldAlert, ChevronDown, ChevronUp } from 'lucide-react';

interface FactualityProblem {
  claim: string;
  reason: string;
}

interface FactualityBadgeProps {
  totalClaims: number | null;
  entailedClaims: number | null;
  entailedRatio: number | null;
  hallucinations?: FactualityProblem[] | null;
  notMentioned?: FactualityProblem[] | null;
  factualityModel?: string | null;
  costUsd?: number | null;
  latencyMs?: number | null;
  compact?: boolean;
}

function ratioColor(ratio: number | null): { ring: string; text: string; bg: string } {
  if (ratio == null) return { ring: 'ring-gray-300', text: 'text-gray-400', bg: 'bg-gray-50' };
  if (ratio >= 0.95) return { ring: 'ring-emerald-300', text: 'text-emerald-700', bg: 'bg-emerald-50' };
  if (ratio >= 0.85) return { ring: 'ring-green-300', text: 'text-green-700', bg: 'bg-green-50' };
  if (ratio >= 0.7) return { ring: 'ring-amber-300', text: 'text-amber-700', bg: 'bg-amber-50' };
  return { ring: 'ring-red-300', text: 'text-red-700', bg: 'bg-red-50' };
}

/**
 * FactualityBadge — Axis-B widget showing entailment % and hallucination count.
 *
 * Click to expand a tooltip listing contradicted + not-mentioned claims with
 * their reasons. Designed to drop into the metrics-page row alongside the
 * judge widgets.
 */
export function FactualityBadge({
  totalClaims,
  entailedClaims,
  entailedRatio,
  hallucinations,
  notMentioned,
  factualityModel,
  costUsd,
  latencyMs,
  compact = false,
}: FactualityBadgeProps) {
  const [expanded, setExpanded] = useState(false);

  const ratioPct = entailedRatio != null ? Math.round(entailedRatio * 100) : null;
  const colors = ratioColor(entailedRatio);
  const hallCount = hallucinations?.length ?? 0;
  const nmCount = notMentioned?.length ?? 0;
  const hasIssues = hallCount + nmCount > 0;
  const Icon = hallCount > 0 ? ShieldAlert : hasIssues ? AlertTriangle : ShieldCheck;

  return (
    <div className="inline-block">
      <button
        type="button"
        onClick={() => hasIssues && setExpanded(v => !v)}
        disabled={!hasIssues}
        className={`inline-flex items-center gap-2 ${compact ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} rounded-md ring-1 ${colors.ring} ${colors.bg} ${colors.text} ${hasIssues ? 'cursor-pointer hover:opacity-90' : 'cursor-default'} transition-opacity`}
        title={hasIssues ? 'Click to inspect flagged claims' : 'No issues flagged'}
      >
        <Icon className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
        <span className="font-semibold">
          {ratioPct != null ? `${ratioPct}%` : 'N/A'}
        </span>
        <span className="text-[10px] opacity-75">
          {entailedClaims ?? 0}/{totalClaims ?? 0} entailed
        </span>
        {hallCount > 0 && (
          <span className="font-mono text-[10px] bg-red-100 text-red-800 px-1.5 py-0.5 rounded">
            {hallCount} halluc
          </span>
        )}
        {hasIssues && (expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
      </button>

      {expanded && hasIssues && (
        <div className="mt-2 p-3 bg-white border border-gray-200 rounded-lg shadow-sm text-xs space-y-3 max-w-md">
          {hallCount > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-red-700 font-semibold mb-1">
                Contradicted ({hallCount})
              </p>
              <ul className="space-y-1.5">
                {hallucinations!.map((h, i) => (
                  <li key={`hall-${i}`} className="border-l-2 border-red-300 pl-2">
                    <p className="text-gray-800">{h.claim}</p>
                    <p className="text-gray-500 italic">{h.reason}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {nmCount > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold mb-1">
                Not in source ({nmCount})
              </p>
              <ul className="space-y-1.5">
                {notMentioned!.map((n, i) => (
                  <li key={`nm-${i}`} className="border-l-2 border-amber-300 pl-2">
                    <p className="text-gray-800">{n.claim}</p>
                    <p className="text-gray-500 italic">{n.reason}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(factualityModel || costUsd != null || latencyMs != null) && (
            <div className="pt-2 border-t border-gray-100 text-[10px] text-gray-400 flex flex-wrap gap-x-3 gap-y-0.5">
              {factualityModel && <span>{factualityModel}</span>}
              {costUsd != null && <span>${costUsd.toFixed(4)}</span>}
              {latencyMs != null && <span>{latencyMs}ms</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
