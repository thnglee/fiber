import React, { useEffect, useState, useCallback } from "react"
import { Readability } from "@mozilla/readability"
import type { PlasmoCSConfig } from "plasmo"
import cssText from "data-text:~/contents/style.css"
import { summarizeArticle } from "~/lib/api-client"
import type { SummaryResponse } from "~/lib/types"
import { Card } from "~/components/ui/Card"
import { Button } from "~/components/ui/Button"
import { Skeleton } from "~/components/ui/Skeleton"
import { formatReadingTime } from "~/lib/utils"

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

const SummarySidebar: React.FC = () => {
  const [summary, setSummary] = useState<SummaryResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(true)

  // Wait for DOM to be ready and article content to be present
  const waitForContent = async (maxRetries = 10, delay = 500): Promise<boolean> => {
    for (let i = 0; i < maxRetries; i++) {
      // Check if document is ready
      if (document.readyState === "complete") {
        // Check for common article content selectors on Vietnamese news sites
        const hasContent = 
          document.querySelector("article") ||
          document.querySelector(".fck_detail") || // vnexpress article content
          document.querySelector(".content-detail") || // tuoitre
          document.querySelector(".dt-news__content") || // dantri
          document.querySelector(".detail-content") || // thanhnien
          document.body.textContent?.trim().length > 500 // Fallback: check if body has substantial content

        if (hasContent) {
          // Additional small delay to ensure content is fully rendered
          await new Promise(resolve => setTimeout(resolve, 300))
          return true
        }
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay))
    }
    return false
  }

  const extractAndSummarize = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Wait for content to be ready
      const isReady = await waitForContent()
      if (!isReady) {
        throw new Error("Không thể tìm thấy nội dung bài viết. Vui lòng thử lại sau khi trang tải xong.")
      }

      // Extract article content using Readability
      const documentClone = document.cloneNode(true) as Document
      const reader = new Readability(documentClone)
      const article = reader.parse()

      if (!article || !article.textContent) {
        throw new Error("Không thể trích xuất nội dung bài viết")
      }

      // Call backend API
      const result = await summarizeArticle(article.textContent)
      setSummary(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã xảy ra lỗi")
      console.error("Summary error:", err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    extractAndSummarize()

    // Listen for URL changes (for SPAs like vnexpress)
    let currentUrl = window.location.href
    
    const checkUrlChange = () => {
      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href
        // Reset state and re-extract
        setSummary(null)
        setError(null)
        extractAndSummarize()
      }
    }

    // Check for URL changes periodically (SPAs don't trigger navigation events)
    const intervalId = setInterval(checkUrlChange, 1000)

    // Also listen for popstate (back/forward navigation)
    const handlePopState = () => {
      setSummary(null)
      setError(null)
      extractAndSummarize()
    }

    window.addEventListener("popstate", handlePopState)

    return () => {
      clearInterval(intervalId)
      window.removeEventListener("popstate", handlePopState)
    }
  }, [extractAndSummarize])

  if (!isOpen) {
    return (
      <div className="fixed top-4 right-4 z-50">
        <Button
          onClick={() => setIsOpen(true)}
          variant="primary"
          size="sm"
        >
          Tóm tắt
        </Button>
      </div>
    )
  }

  return (
    <div className="fixed top-0 right-0 h-full w-[400px] bg-white shadow-2xl z-50 border-l border-gray-200 p-6 overflow-y-auto animate-slide-in-right">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Tóm tắt bài viết</h2>
        <Button
          onClick={() => setIsOpen(false)}
          variant="ghost"
          size="sm"
          className="!p-2"
        >
          ✕
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <div className="mt-6 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      )}

      {error && (
        <Card className="border-red-200 bg-red-50">
          <p className="text-red-700 text-sm mb-4">{error}</p>
          <Button
            onClick={extractAndSummarize}
            variant="secondary"
            size="sm"
          >
            Thử lại
          </Button>
        </Card>
      )}

      {summary && !isLoading && (
        <div className="space-y-6">
          <Card>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-500 mb-2">
                  Thời gian đọc: {formatReadingTime(summary.readingTime)}
                </p>
                <p className="text-gray-900 leading-relaxed whitespace-pre-line">
                  {summary.summary}
                </p>
              </div>
            </div>
          </Card>

          {summary.keyPoints.length > 0 && (
            <Card>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Điểm chính
              </h3>
              <ul className="space-y-2">
                {summary.keyPoints.map((point, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="text-gray-400 mt-1">•</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

export default SummarySidebar

