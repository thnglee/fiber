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
import { isArticlePage } from "~/lib/page-detector"

export const config: PlasmoCSConfig = {
  matches: [
    "https://vnexpress.net/*",
    "https://tuoitre.vn/*",
    "https://dantri.com.vn/*",
    "https://thanhnien.vn/*",
    "https://vietnamnet.vn/*",
    "https://laodong.vn/*",
    "https://tienphong.vn/*",
    "https://vtv.vn/*",
    "https://nld.com.vn/*"
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
  const [isArticle, setIsArticle] = useState<boolean | null>(null) // null = detecting, true = article, false = not article

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
    // Detect page type and conditionally auto-summarize
    const initializePage = async () => {
      setIsArticle(null) // Start detecting
      const isArticle = await isArticlePage()
      setIsArticle(isArticle)

      // Only auto-summarize on article pages
      if (isArticle) {
        extractAndSummarize()
      }
    }

    initializePage()

    // Listen for URL changes (for SPAs like vnexpress)
    let currentUrl = window.location.href

    const checkUrlChange = () => {
      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href
        // Reset state and re-detect page type
        setSummary(null)
        setError(null)
        initializePage()
      }
    }

    // Check for URL changes periodically (SPAs don't trigger navigation events)
    const intervalId = setInterval(checkUrlChange, 1000)

    // Also listen for popstate (back/forward navigation)
    const handlePopState = () => {
      setSummary(null)
      setError(null)
      initializePage()
    }

    window.addEventListener("popstate", handlePopState)

    return () => {
      clearInterval(intervalId)
      window.removeEventListener("popstate", handlePopState)
    }
  }, [extractAndSummarize])

  // Show collapsed button if user closed sidebar OR if it's not an article page
  if (!isOpen || isArticle === false) {
    return (
      <div className="fixed top-4 right-4 z-50">
        <Button
          onClick={() => {
            setIsOpen(true)
            // If not an article page, manually trigger summarization
            if (isArticle === false && !summary && !isLoading) {
              extractAndSummarize()
            }
          }}
          variant="primary"
          size="sm"
        >
          {isArticle === false ? "Tóm tắt trang này" : "Tóm tắt"}
        </Button>
      </div>
    )
  }

  // Show loading state while detecting page type
  if (isArticle === null) {
    return (
      <div className="fixed top-0 right-0 h-full w-[400px] bg-white shadow-2xl z-50 border-l border-gray-200 p-6 overflow-y-auto animate-slide-in-right">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Tóm tắt bài viết</h2>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
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
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                    {summary.category}
                  </span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                    {formatReadingTime(summary.readingTime)}
                  </span>
                </div>
                <p className="text-gray-900 leading-relaxed whitespace-pre-line">
                  {summary.summary}
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

export default SummarySidebar

