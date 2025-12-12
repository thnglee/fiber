import React from "react"
import { cn, getTrustLevel } from "~/lib/utils"

interface ScoreBadgeProps {
  score: number // 0-100
  className?: string
}

export const ScoreBadge: React.FC<ScoreBadgeProps> = ({ score, className }) => {
  const level = getTrustLevel(score)
  
  const styles = {
    high: "text-green-700 bg-green-50 border-green-200",
    medium: "text-yellow-700 bg-yellow-50 border-yellow-200",
    low: "text-red-700 bg-red-50 border-red-200"
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium",
        styles[level],
        className
      )}
    >
      <span className="font-semibold">{score}/100</span>
      <span className="text-xs">
        {level === "high" ? "Đáng tin" : level === "medium" ? "Cần xem xét" : "Không đáng tin"}
      </span>
    </div>
  )
}

