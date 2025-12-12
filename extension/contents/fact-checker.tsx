import React, { useEffect, useState, useRef, useCallback } from "react"
import type { PlasmoCSConfig } from "plasmo"
import cssText from "data-text:~/contents/style.css"
import { factCheck } from "~/lib/api-client"
import type { FactCheckResponse } from "~/lib/types"
import { Card } from "~/components/ui/Card"
import { Button } from "~/components/ui/Button"
import { ScoreBadge } from "~/components/ui/ScoreBadge"
import { Skeleton } from "~/components/ui/Skeleton"

export const config: PlasmoCSConfig = {
  matches: [
    "https://vnexpress.net/*",
    "https://tuoitre.vn/*",
    "https://dantri.com.vn/*",
    "https://thanhnien.vn/*"
  ],
  all_frames: false
}

export const getStyle = () => {
  const style = document.createElement("style")
  style.textContent = cssText
  return style
}

interface SelectionState {
  text: string
  position: { x: number; y: number }
}

const FactCheckTooltip: React.FC<{
  position: { x: number; y: number }
  onCheck: () => void
}> = ({ position, onCheck }) => {
  const tooltipRef = useRef<HTMLDivElement>(null)
  
  // Calculate position to keep tooltip in viewport
  // Position is already in viewport coordinates (from getBoundingClientRect)
  const tooltipWidth = 120
  const tooltipHeight = 36
  const offset = 12
  
  const left = Math.max(
    offset,
    Math.min(position.x - tooltipWidth / 2, window.innerWidth - tooltipWidth - offset)
  )
  const top = Math.max(
    offset,
    Math.min(position.y - tooltipHeight - offset, window.innerHeight - tooltipHeight - offset)
  )

  useEffect(() => {
    if (tooltipRef.current) {
      console.log("[FactChecker] Tooltip mounted in DOM at:", {
        left,
        top,
        position: tooltipRef.current.getBoundingClientRect(),
        computedStyle: window.getComputedStyle(tooltipRef.current).display,
        zIndex: window.getComputedStyle(tooltipRef.current).zIndex
      })
    }
  }, [left, top])

  return (
    <div
      ref={tooltipRef}
      className="fixed z-[9999] bg-black text-white rounded-lg px-3 py-1.5 text-sm font-medium shadow-lg cursor-pointer hover:bg-gray-900 transition-colors flex items-center gap-1.5"
      style={{
        left: `${left}px`,
        top: `${top}px`,
        position: "fixed",
        pointerEvents: "auto"
      }}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        console.log("[FactChecker] Tooltip clicked!")
        onCheck()
      }}
      onMouseDown={(e) => {
        e.stopPropagation()
      }}
    >
      <svg
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      <span>Kiểm tra</span>
    </div>
  )
}

const FactCheckModal: React.FC<{
  text: string
  position: { x: number; y: number }
  onClose: () => void
}> = ({ text, position, onClose }) => {
  const [result, setResult] = useState<FactCheckResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true) // Start with loading state
  const [error, setError] = useState<string | null>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  const checkFact = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      console.log("[FactChecker] Starting fact check for text:", text.substring(0, 50))
      const data = await factCheck(text)
      console.log("[FactChecker] Fact check result:", data)
      setResult(data)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Đã xảy ra lỗi"
      console.error("[FactChecker] Fact check error:", err)
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [text])

  useEffect(() => {
    checkFact()
  }, [checkFact])

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        // Only close if clicking outside the modal
        const target = event.target as HTMLElement
        // Don't close if clicking on the tooltip or other extension elements
        if (!target.closest('[data-plasmo-root]')) {
          onClose()
        }
      }
    }

    // Use a small delay to prevent immediate closing when opening
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside)
    }, 100)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [onClose])

  // Position modal near selection but keep it in viewport
  // Position is already in viewport coordinates (from getBoundingClientRect)
  const modalWidth = 384 // w-96 = 384px
  const modalHeight = 500 // estimated max height
  const offset = 16

  const modalPosition = {
    left: Math.max(
      offset,
      Math.min(position.x - modalWidth / 2, window.innerWidth - modalWidth - offset)
    ),
    top: Math.max(
      offset,
      Math.min(position.y + 20, window.innerHeight - modalHeight - offset)
    )
  }

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className="fixed inset-0 z-[9998] bg-black/10"
        onClick={onClose}
        style={{ pointerEvents: "auto" }}
      />
      {/* Modal */}
      <div
        ref={modalRef}
        className="fixed z-[9999] w-96 bg-white rounded-xl shadow-xl border border-gray-200 p-6 animate-in fade-in zoom-in-95 max-h-[600px] overflow-y-auto"
        style={{
          left: `${modalPosition.left}px`,
          top: `${modalPosition.top}px`,
          pointerEvents: "auto"
        }}
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
        }}
        onMouseDown={(e) => {
          e.stopPropagation()
        }}
      >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-base font-semibold text-gray-900">Kiểm tra thông tin</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
          aria-label="Đóng"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Selected Text Preview */}
      <div className="mb-5 p-3 bg-gray-50 rounded-lg text-sm text-gray-600 border border-gray-200 leading-relaxed">
        <span className="font-medium text-gray-500 text-xs uppercase tracking-wide mb-1 block">
          Đoạn văn đã chọn:
        </span>
        <p className="mt-1.5">"{text.substring(0, 150)}{text.length > 150 ? "..." : ""}"</p>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-28" variant="rectangular" />
            <Skeleton className="h-4 w-20" variant="text" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" variant="text" />
            <Skeleton className="h-4 w-full" variant="text" />
            <Skeleton className="h-4 w-4/5" variant="text" />
          </div>
          <div className="space-y-2 pt-2">
            <Skeleton className="h-3 w-24" variant="text" />
            <Skeleton className="h-3 w-32" variant="text" />
            <Skeleton className="h-3 w-28" variant="text" />
          </div>
        </div>
      )}

      {/* Error State */}
      {error && !isLoading && (
        <div className="space-y-4">
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700 font-medium mb-1">Đã xảy ra lỗi</p>
            <p className="text-xs text-red-600">{error}</p>
          </div>
          <Button
            onClick={checkFact}
            variant="primary"
            size="sm"
            className="w-full"
          >
            Thử lại
          </Button>
        </div>
      )}

      {/* Result State */}
      {result && !isLoading && !error && (
        <div className="space-y-5">
          {/* Trust Score Badge */}
          <div className="flex items-center justify-center">
            <ScoreBadge score={result.score} />
          </div>

          {/* Analysis Section */}
          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Phân tích
            </h4>
            <p className="text-sm text-gray-700 leading-relaxed">{result.reason}</p>
          </div>

          {/* Sources Section */}
          {result.sources.length > 0 && (
            <div className="border-t border-gray-200 pt-4">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Nguồn tham khảo
              </h4>
              <ul className="space-y-2">
                {result.sources.map((source, index) => {
                  try {
                    const url = new URL(source)
                    const domain = url.hostname.replace("www.", "")
                    return (
                      <li key={index}>
                        <a
                          href={source}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex items-start gap-2 text-xs text-gray-600 hover:text-gray-900 transition-colors p-2 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-200"
                          onClick={(e) => {
                            e.stopPropagation()
                            window.open(source, '_blank', 'noopener,noreferrer')
                            e.preventDefault()
                          }}
                        >
                          <svg
                            className="w-4 h-4 mt-0.5 text-gray-400 group-hover:text-gray-600 flex-shrink-0"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                          <span className="break-all leading-relaxed">
                            <span className="font-medium text-gray-700">{domain}</span>
                            <span className="text-gray-400 ml-1">{url.pathname}</span>
                          </span>
                        </a>
                      </li>
                    )
                  } catch {
                    return (
                      <li key={index}>
                        <a
                          href={source}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex items-start gap-2 text-xs text-gray-600 hover:text-gray-900 transition-colors p-2 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-200 break-all"
                          onClick={(e) => {
                            e.stopPropagation()
                            window.open(source, '_blank', 'noopener,noreferrer')
                            e.preventDefault()
                          }}
                        >
                          <svg
                            className="w-4 h-4 mt-0.5 text-gray-400 group-hover:text-gray-600 flex-shrink-0"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                          <span className="leading-relaxed">{source}</span>
                        </a>
                      </li>
                    )
                  }
                })}
              </ul>
            </div>
          )}

          {/* Verified Badge */}
          {result.verified && (
            <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="font-medium">Đã được xác minh bởi nguồn uy tín</span>
            </div>
          )}
        </div>
      )}
      </div>
    </>
  )
}

const FactChecker: React.FC = () => {
  const [selection, setSelection] = useState<SelectionState | null>(null)
  const [modalData, setModalData] = useState<SelectionState | null>(null)

  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      // Small delay to ensure selection is captured
      setTimeout(() => {
        const selectedText = window.getSelection()?.toString().trim()
        
        if (selectedText && selectedText.length > 10) {
          const selection = window.getSelection()
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0)
            const rect = range.getBoundingClientRect()
            const position = {
              x: rect.left + rect.width / 2,
              y: rect.top
            }
            console.log("[FactChecker] Text selected:", selectedText.substring(0, 50), "Position:", position)
            setSelection({
              text: selectedText,
              position
            })
          }
        } else {
          setSelection(null)
        }
      }, 10)
    }

    // Use capture phase to catch the event early
    document.addEventListener("mouseup", handleMouseUp, true)
    return () => document.removeEventListener("mouseup", handleMouseUp, true)
  }, [])

  const handleCheck = () => {
    if (selection) {
      console.log("[FactChecker] Opening modal with selection:", selection.text.substring(0, 50))
      // Store the selection data for the modal before clearing it
      setModalData(selection)
      setSelection(null) // Clear selection to hide tooltip
      window.getSelection()?.removeAllRanges() // Clear text selection
    }
  }

  const handleCloseModal = () => {
    setModalData(null)
    window.getSelection()?.removeAllRanges()
  }

  // Debug logging
  useEffect(() => {
    if (selection) {
      console.log("[FactChecker] Selection state:", {
        hasSelection: !!selection,
        text: selection.text.substring(0, 50),
        position: selection.position,
        hasModalData: !!modalData
      })
    }
    if (modalData) {
      console.log("[FactChecker] Modal data set:", modalData.text.substring(0, 50))
    }
  }, [selection, modalData])

  // Log when tooltip should render
  useEffect(() => {
    if (selection && !modalData) {
      console.log("[FactChecker] Should render tooltip:", {
        text: selection.text.substring(0, 50),
        position: selection.position
      })
    }
  }, [selection, modalData])

  return (
    <>
      {selection && !modalData && (
        <FactCheckTooltip
          position={selection.position}
          onCheck={handleCheck}
        />
      )}
      
      {modalData && (
        <FactCheckModal
          text={modalData.text}
          position={modalData.position}
          onClose={handleCloseModal}
        />
      )}
    </>
  )
}

export default FactChecker

