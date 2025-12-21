import React, { useEffect, useState, useCallback, useRef } from "react"
import { Readability } from "@mozilla/readability"
import type { PlasmoCSConfig } from "plasmo"
import cssText from "data-text:~/contents/style.css"
import { summarizeArticle } from "~/lib/api-client"
import type { SummaryResponse, PageContext } from "~/lib/types"
import { Card } from "~/components/ui/Card"
import { Button } from "~/components/ui/Button"
import { Skeleton } from "~/components/ui/Skeleton"
import { formatReadingTime } from "~/lib/utils"
import { isArticlePage } from "~/lib/page-detector"
import { waitForContent } from "~/lib/dom-utils"
import { NavigationObserver } from "~/lib/navigation-observer"
import { SELECTORS } from "~/lib/constants"
import { getPageContext } from "~/lib/context-provider"

// Note: Plasmo requires a literal array for matches, cannot use dynamic generation
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
  const [pageIsArticle, setPageIsArticle] = useState<boolean | null>(null) // null = detecting, true = article, false = not article
  const contextRef = useRef<PageContext | null>(null)

  // Get page context once on mount
  useEffect(() => {
    try {
      contextRef.current = getPageContext()
    } catch (err) {
      console.error("[SummarySidebar] Failed to get page context:", err)
    }
  }, [])

  const extractAndSummarize = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Wait for content to be ready using dom-utils
      const contentSelectors = [
        ...SELECTORS.ARTICLE,
        ...Object.values(SELECTORS.SITE_SPECIFIC),
      ]

      const isReady = await waitForContent(contentSelectors)
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

      // Call backend API with context and URL for proper tracking
      const result = await summarizeArticle(
        article.textContent,
        contextRef.current || undefined,
        window.location.href // Pass URL so backend tracks inputType as 'url'
      )
      setSummary(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã xảy ra lỗi")
      console.error("[SummarySidebar] Summary error:", err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    // Detect page type and conditionally auto-summarize
    const initializePage = async () => {
      setPageIsArticle(null) // Start detecting
      const detectedIsArticle = await isArticlePage()
      setPageIsArticle(detectedIsArticle)

      // Only auto-summarize on article pages
      if (detectedIsArticle) {
        extractAndSummarize()
      }
    }

    initializePage()

    // Use NavigationObserver instead of polling
    const navObserver = new NavigationObserver()

    const unsubscribe = navObserver.onNavigate(() => {
      // Reset state and re-detect page type
      setSummary(null)
      setError(null)
      initializePage()
    })

    return () => {
      unsubscribe()
      navObserver.destroy()
    }
  }, [extractAndSummarize])

  // Show collapsed button if user closed sidebar OR if it's not an article page
  if (!isOpen || pageIsArticle === false) {
    return (
      <div className="fixed top-4 right-4 z-50">
        <Button
          onClick={() => {
            setIsOpen(true)
            // Only trigger summarization if:
            // 1. Not an article page (manual trigger)
            // 2. No existing summary
            // 3. Not currently loading
            // 4. Page detector hasn't already determined it's not an article
            if (pageIsArticle === false && !summary && !isLoading) {
              extractAndSummarize()
            }
          }}
          variant="primary"
          size="sm"
        >
          {pageIsArticle === false ? "Tóm tắt trang này" : "Tóm tắt"}
        </Button>
      </div>
    )
  }

  // Show loading state while detecting page type
  if (pageIsArticle === null) {
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

