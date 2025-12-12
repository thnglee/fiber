import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Utility function to merge Tailwind classes
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Get trust level from score (0-100)
 */
export function getTrustLevel(score: number): "high" | "medium" | "low" {
  if (score >= 70) return "high"
  if (score >= 40) return "medium"
  return "low"
}

/**
 * Format reading time
 */
export function formatReadingTime(minutes: number): string {
  if (minutes < 1) return "< 1 phút"
  return `${Math.round(minutes)} phút`
}

