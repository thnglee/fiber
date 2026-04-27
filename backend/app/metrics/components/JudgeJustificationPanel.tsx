"use client"

import { useState } from "react"

/**
 * JudgeJustificationPanel — collapsible justification text + length_note from
 * the judge. Clamped to ~3 lines when collapsed; click to expand for the full
 * Vietnamese justification block.
 */
interface Props {
  justification?: string | null
  lengthNote?: string | null
  judgeModel?: string | null
  costUsd?: number | null
  latencyMs?: number | null
  className?: string
}

export function JudgeJustificationPanel({
  justification,
  lengthNote,
  judgeModel,
  costUsd,
  latencyMs,
  className = "",
}: Props) {
  const [open, setOpen] = useState(false)
  const hasText = !!(justification && justification.trim().length > 0)
  if (!hasText && !lengthNote) return null

  return (
    <div className={`rounded-md border border-gray-200 bg-gray-50/40 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-left"
        aria-expanded={open}
      >
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
          Judge justification
        </span>
        <svg
          className={`w-3.5 h-3.5 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div className={`px-3 pb-3 text-xs text-gray-700 ${open ? "" : "line-clamp-3"}`}>
        {hasText ? <p className="whitespace-pre-wrap">{justification}</p> : null}
        {lengthNote && (
          <p className="mt-2 text-[11px] text-gray-500 italic">
            <span className="font-semibold not-italic">Length note:</span> {lengthNote}
          </p>
        )}
        {open && (judgeModel || costUsd != null || latencyMs != null) && (
          <p className="mt-2 text-[10px] text-gray-400 font-mono">
            {judgeModel ?? "?"}
            {costUsd != null && ` · $${costUsd.toFixed(4)}`}
            {latencyMs != null && ` · ${latencyMs}ms`}
          </p>
        )}
      </div>
    </div>
  )
}
