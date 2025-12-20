import React, { useEffect, useState, useCallback, useRef } from "react"
import type { PlasmoCSConfig } from "plasmo"
import cssText from "data-text:~/contents/style.css"
import { factCheck, summarizeArticle } from "~/lib/api-client"
import type { FactCheckResponse, SummaryResponse, SelectionState, PageContext } from "~/lib/types"
import { ScoreBadge } from "~/components/ui/ScoreBadge"
import { formatReadingTime } from "~/lib/utils"
import { BaseModal } from "~/components/modals/BaseModal"
import { SelectedTextPreview, LoadingState, ErrorState } from "~/components/modals/ModalContent"
import { calculateTooltipPosition, getSelectionInfo, clearSelection } from "~/lib/dom-utils"
import { DIMENSIONS, Z_INDEX, TIMEOUTS } from "~/lib/constants"
import { getPageContext } from "~/lib/context-provider"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  all_frames: false
}

export const getStyle = () => {
  const style = document.createElement("style")
  style.textContent = cssText
  return style
}

const FactCheckTooltip: React.FC<{
  position: { x: number; y: number }
  onCheck: () => void
  onSummarize: () => void
}> = ({ position, onCheck, onSummarize }) => {
  // Calculate position using utility
  const selectionRect = {
    left: position.x,
    top: position.y,
    width: 0,
    height: 0,
    right: position.x,
    bottom: position.y,
    x: position.x,
    y: position.y,
  } as DOMRect
  const tooltipPosition = calculateTooltipPosition(selectionRect, {
    width: DIMENSIONS.TOOLTIP.WIDTH,
    height: DIMENSIONS.TOOLTIP.HEIGHT
  })

  return (
    <div
      className="fixed bg-black text-white rounded-lg px-2 py-1 text-sm font-medium shadow-lg transition-colors flex items-center gap-2"
      style={{
        left: `${tooltipPosition.left}px`,
        top: `${tooltipPosition.top}px`,
        zIndex: Z_INDEX.TOOLTIP,
        position: "fixed",
        pointerEvents: "auto"
      }}
    >
      <button
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          onCheck()
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-black text-white hover:bg-gray-900"
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
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          onSummarize()
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-white text-black hover:bg-gray-100"
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
            d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"
          />
        </svg>
        <span className="text-black">Tóm tắt</span>
      </button>
    </div>
  )
}

const FactCheckModal: React.FC<{
  text: string
  position: { x: number; y: number }
  onClose: () => void
}> = ({ text, position, onClose }) => {
  const [result, setResult] = useState<FactCheckResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const contextRef = useRef<PageContext | null>(null)

  // Get page context once on mount
  useEffect(() => {
    try {
      contextRef.current = getPageContext()
    } catch (err) {
      console.error("[FactCheckModal] Failed to get page context:", err)
    }
  }, [])

  const checkFact = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      const data = await factCheck(text, contextRef.current || undefined)
      setResult(data)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Đã xảy ra lỗi"
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [text])

  useEffect(() => {
    checkFact()
  }, [checkFact])

  return (
    <BaseModal title="Kiểm tra thông tin" position={position} onClose={onClose}>
      <SelectedTextPreview text={text} maxLength={150} />

      {isLoading && <LoadingState />}

      {error && !isLoading && <ErrorState message={error} onRetry={checkFact} />}

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
    </BaseModal>
  )
}

const SummarizeModal: React.FC<{
  text: string
  position: { x: number; y: number }
  onClose: () => void
}> = ({ text, position, onClose }) => {
  const [result, setResult] = useState<SummaryResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const contextRef = useRef<PageContext | null>(null)

  // Get page context once on mount
  useEffect(() => {
    try {
      contextRef.current = getPageContext()
    } catch (err) {
      console.error("[SummarizeModal] Failed to get page context:", err)
    }
  }, [])

  const doSummarize = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      const data = await summarizeArticle(text, contextRef.current || undefined)
      setResult(data)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Đã xảy ra lỗi"
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [text])

  useEffect(() => {
    doSummarize()
  }, [doSummarize])

  return (
    <BaseModal title="Tóm tắt đoạn văn" position={position} onClose={onClose}>
      <SelectedTextPreview text={text} maxLength={300} />

      {isLoading && <LoadingState />}

      {error && !isLoading && <ErrorState message={error} onRetry={doSummarize} />}

      {result && !isLoading && !error && (
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                {result.category}
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                {formatReadingTime(result.readingTime)}
              </span>
            </div>
            <span className="text-xs text-gray-500">Summary:</span>
            <p className="text-sm text-gray-900 mt-1">{result.summary}</p>
          </div>
        </div>
      )}
    </BaseModal>
  )
}

const ModalRoot: React.FC = () => {
  const [selection, setSelection] = useState<SelectionState | null>(null)
  const [modalData, setModalData] = useState<SelectionState | null>(null)
  const [summarizeModalData, setSummarizeModalData] = useState<SelectionState | null>(null)

  useEffect(() => {
    const handleMouseUp = () => {
      // Small delay to ensure selection is captured
      setTimeout(() => {
        const selectionInfo = getSelectionInfo()
        setSelection(selectionInfo)
      }, TIMEOUTS.SELECTION_DELAY)
    }

    // Use capture phase to catch the event early
    document.addEventListener("mouseup", handleMouseUp, true)
    return () => document.removeEventListener("mouseup", handleMouseUp, true)
  }, [])

  const handleCheck = () => {
    if (selection) {
      setModalData(selection)
      setSelection(null)
      clearSelection()
    }
  }

  const handleSummarize = () => {
    if (selection) {
      setSummarizeModalData(selection)
      setSelection(null)
      clearSelection()
    }
  }

  const handleCloseModal = () => {
    setModalData(null)
    clearSelection()
  }

  const handleCloseSummarize = () => {
    setSummarizeModalData(null)
    clearSelection()
  }

  return (
    <>
      {selection && !modalData && !summarizeModalData && (
        <FactCheckTooltip
          position={selection.position}
          onCheck={handleCheck}
          onSummarize={handleSummarize}
        />
      )}

      {modalData && (
        <FactCheckModal
          text={modalData.text}
          position={modalData.position}
          onClose={handleCloseModal}
        />
      )}

      {summarizeModalData && (
        <SummarizeModal
          text={summarizeModalData.text}
          position={summarizeModalData.position}
          onClose={handleCloseSummarize}
        />
      )}
    </>
  )
}

export default ModalRoot
