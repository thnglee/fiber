"use client"

import { useState } from "react"

interface SummaryDebugInfo {
  extractedContent: {
    length: number
    preview: string
    fullContent?: string
  }
  prompt?: string
  openaiResponse?: {
    raw: string
    model: string
    usage: any
  }
}

interface FactCheckDebugInfo {
  selectedText: string
  tavilySearch?: {
    query: string
    resultsCount: number
    results: Array<{
      title: string
      url: string
      content: string
      contentLength: number
      score?: number
    }>
  }
  augmentedPrompt?: string
  openaiResponse?: {
    raw: string
    model: string
    usage: any
  }
}

export default function DebugPage() {
  const [summaryUrl, setSummaryUrl] = useState("")
  const [summaryInputType, setSummaryInputType] = useState<"url" | "paragraph">("url")
  const [summaryParagraph, setSummaryParagraph] = useState("")
  const [summaryResult, setSummaryResult] = useState<any>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)

  const [factCheckText, setFactCheckText] = useState("")
  const [factCheckResult, setFactCheckResult] = useState<any>(null)
  const [factCheckLoading, setFactCheckLoading] = useState(false)
  const [factCheckError, setFactCheckError] = useState<string | null>(null)

  const handleSummarize = async () => {
    setSummaryLoading(true)
    setSummaryError(null)
    setSummaryResult(null)

    try {
      const body: any = { debug: true }
      if (summaryInputType === "url") {
        body.url = summaryUrl
      } else {
        body.content = summaryParagraph
      }

      const response = await fetch("/api/summarize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to summarize")
      }

      const data = await response.json()
      setSummaryResult(data)
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setSummaryLoading(false)
    }
  }

  const handleFactCheck = async () => {
    setFactCheckLoading(true)
    setFactCheckError(null)
    setFactCheckResult(null)

    try {
      const response = await fetch("/api/fact-check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: factCheckText,
          debug: true,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to fact-check")
      }

      const data = await response.json()
      setFactCheckResult(data)
    } catch (err) {
      setFactCheckError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setFactCheckLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Debug Interface</h1>
        <p className="text-gray-600 mb-8">
          Test and inspect intermediate results for Summary and Fact-Check features
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Summary Feature */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Summary Feature
            </h2>

            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-4 mb-3">
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      name="summaryInputType"
                      value="url"
                      checked={summaryInputType === "url"}
                      onChange={() => setSummaryInputType("url")}
                      className="mr-2"
                    />
                    <span className="text-sm">Article URL</span>
                  </label>
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      name="summaryInputType"
                      value="paragraph"
                      checked={summaryInputType === "paragraph"}
                      onChange={() => setSummaryInputType("paragraph")}
                      className="mr-2"
                    />
                    <span className="text-sm">Selected paragraph</span>
                  </label>
                </div>

                {summaryInputType === "url" ? (
                  <>
                    <input
                      type="url"
                      value={summaryUrl}
                      onChange={(e) => setSummaryUrl(e.target.value)}
                      placeholder="https://vnexpress.net/..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      The content will be extracted using Mozilla/Readability
                    </p>
                  </>
                ) : (
                  <>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Selected paragraph</label>
                    <textarea
                      value={summaryParagraph}
                      onChange={(e) => setSummaryParagraph(e.target.value)}
                      placeholder="Paste the selected paragraph here..."
                      className="w-full h-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">The selected paragraph will be summarized directly.</p>
                  </>
                )}
              </div>

              <button
                onClick={handleSummarize}
                disabled={(summaryInputType === "url" ? !summaryUrl.trim() : !summaryParagraph.trim()) || summaryLoading}
                className="w-full px-4 py-2 bg-black text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {summaryLoading ? "Processing..." : "Test Summary"}
              </button>

              {summaryError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">{summaryError}</p>
                </div>
              )}

              {summaryResult && (
                <div className="space-y-4 mt-4">
                  <div className="border-t border-gray-200 pt-4">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                      Final Result
                    </h3>
                    <div className="space-y-2">
                      <div>
                        <span className="text-xs text-gray-500">Summary:</span>
                        <p className="text-sm text-gray-900 mt-1">
                          {summaryResult.summary}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500">Category:</span>
                        <div className="mt-1">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            {summaryResult.category}
                          </span>
                        </div>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500">Reading Time:</span>
                        <p className="text-sm text-gray-900 mt-1">
                          {summaryResult.readingTime} minutes
                        </p>
                      </div>
                    </div>
                  </div>

                  {summaryResult.debug && (
                    <div className="border-t border-gray-200 pt-4 space-y-4">
                      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                        Debug Information
                      </h3>

                      {/* URL */}
                      {summaryResult.debug.url && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-700 mb-2">
                            1. Article URL
                          </h4>
                          <div className="bg-gray-50 rounded-lg p-3 text-xs">
                            <a
                              href={summaryResult.debug.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline break-all"
                            >
                              {summaryResult.debug.url}
                            </a>
                          </div>
                        </div>
                      )}

                      {/* Extracted Content from Readability */}
                      {summaryResult.debug.extractedContent && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-700 mb-2">
                            {summaryResult.debug.url ? "2. " : "1. "}Content Extracted from Mozilla/Readability
                          </h4>
                          <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-2">
                            {summaryResult.debug.extractedContent.title && (
                              <div className="text-gray-600 mb-2">
                                <span className="font-semibold">Title:</span> {summaryResult.debug.extractedContent.title}
                              </div>
                            )}
                            {summaryResult.debug.extractedContent.excerpt && (
                              <div className="text-gray-600 mb-2">
                                <span className="font-semibold">Excerpt:</span> {summaryResult.debug.extractedContent.excerpt}
                              </div>
                            )}
                            <div className="text-gray-600 mb-2">
                              <span className="font-semibold">Length:</span> {summaryResult.debug.extractedContent.length} characters
                            </div>
                            <div className="text-gray-900 whitespace-pre-wrap max-h-60 overflow-y-auto border-t border-gray-200 pt-2 mt-2 font-mono text-xs">
                              {summaryResult.debug.extractedContent.fullContent ||
                                summaryResult.debug.extractedContent.preview}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Prompt */}
                      {summaryResult.debug.prompt && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-700 mb-2">
                            {summaryResult.debug.url ? "3. " : "2. "}OpenAI Prompt
                          </h4>
                          <div className="bg-gray-50 rounded-lg p-3 text-xs font-mono whitespace-pre-wrap max-h-60 overflow-y-auto">
                            {summaryResult.debug.prompt}
                          </div>
                        </div>
                      )}

                      {/* OpenAI Response */}
                      {summaryResult.debug.openaiResponse && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-700 mb-2">
                            {summaryResult.debug.url ? "4. " : "3. "}OpenAI Response
                          </h4>
                          <div className="bg-gray-50 rounded-lg p-3 text-xs font-mono space-y-2">
                            <div className="text-gray-600">
                              Model: {summaryResult.debug.openaiResponse.model}
                            </div>
                            {summaryResult.debug.openaiResponse.usage && (
                              <div className="text-gray-600">
                                Usage: {JSON.stringify(
                                  summaryResult.debug.openaiResponse.usage,
                                  null,
                                  2
                                )}
                              </div>
                            )}
                            <div className="text-gray-900 whitespace-pre-wrap max-h-60 overflow-y-auto border-t border-gray-200 pt-2 mt-2">
                              {summaryResult.debug.openaiResponse.raw}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Fact-Check Feature */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Fact-Check Feature
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Text Selected (to fact-check)
                </label>
                <textarea
                  value={factCheckText}
                  onChange={(e) => setFactCheckText(e.target.value)}
                  placeholder="Enter text to fact-check..."
                  className="w-full h-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                onClick={handleFactCheck}
                disabled={!factCheckText.trim() || factCheckLoading}
                className="w-full px-4 py-2 bg-black text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {factCheckLoading ? "Processing..." : "Test Fact-Check"}
              </button>

              {factCheckError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">{factCheckError}</p>
                </div>
              )}

              {factCheckResult && (
                <div className="space-y-4 mt-4">
                  <div className="border-t border-gray-200 pt-4">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                      Final Result
                    </h3>
                    <div className="space-y-2">
                      <div>
                        <span className="text-xs text-gray-500">Score:</span>
                        <p className="text-sm text-gray-900 mt-1">
                          {factCheckResult.score}/100
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500">Reason:</span>
                        <p className="text-sm text-gray-900 mt-1">
                          {factCheckResult.reason}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500">Verified:</span>
                        <p className="text-sm text-gray-900 mt-1">
                          {factCheckResult.verified ? "Yes" : "No"}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500">Sources:</span>
                        <ul className="list-disc list-inside text-sm text-gray-900 mt-1">
                          {factCheckResult.sources?.map((source: string, i: number) => (
                            <li key={i} className="break-all">{source}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>

                  {factCheckResult.debug && (
                    <div className="border-t border-gray-200 pt-4 space-y-4">
                      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                        Debug Information
                      </h3>

                      {/* Selected Text */}
                      <div>
                        <h4 className="text-xs font-semibold text-gray-700 mb-2">
                          1. Selected Text
                        </h4>
                        <div className="bg-gray-50 rounded-lg p-3 text-sm">
                          {factCheckResult.debug.selectedText}
                        </div>
                      </div>

                      {/* Tavily Search Results */}
                      {factCheckResult.debug.tavilySearch && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-700 mb-2">
                            2. Tavily Retrieval Results
                          </h4>
                          <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-3">
                            <div className="text-gray-600">
                              Query: "{factCheckResult.debug.tavilySearch.query}"
                            </div>
                            <div className="text-gray-600">
                              Results Found: {factCheckResult.debug.tavilySearch.resultsCount}
                            </div>
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                              {factCheckResult.debug.tavilySearch.results.map(
                                (result: any, i: number) => (
                                  <div
                                    key={i}
                                    className="border border-gray-200 rounded p-2 bg-white"
                                  >
                                    <div className="font-semibold text-gray-900 mb-1">
                                      {result.title}
                                    </div>
                                    <div className="text-gray-600 text-xs mb-1 break-all">
                                      {result.url}
                                    </div>
                                    {result.score && (
                                      <div className="text-gray-500 text-xs mb-1">
                                        Score: {result.score}
                                      </div>
                                    )}
                                    <div className="text-gray-700 text-xs mt-1 line-clamp-3">
                                      {result.content}
                                    </div>
                                    <div className="text-gray-400 text-xs mt-1">
                                      Content Length: {result.contentLength} chars
                                    </div>
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Augmented Prompt */}
                      {factCheckResult.debug.augmentedPrompt && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-700 mb-2">
                            3. Augmented Prompt (with Tavily results)
                          </h4>
                          <div className="bg-gray-50 rounded-lg p-3 text-xs font-mono whitespace-pre-wrap max-h-60 overflow-y-auto">
                            {factCheckResult.debug.augmentedPrompt}
                          </div>
                        </div>
                      )}

                      {/* OpenAI Response */}
                      {factCheckResult.debug.openaiResponse && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-700 mb-2">
                            4. OpenAI Response
                          </h4>
                          <div className="bg-gray-50 rounded-lg p-3 text-xs font-mono space-y-2">
                            <div className="text-gray-600">
                              Model: {factCheckResult.debug.openaiResponse.model}
                            </div>
                            {factCheckResult.debug.openaiResponse.usage && (
                              <div className="text-gray-600">
                                Usage: {JSON.stringify(
                                  factCheckResult.debug.openaiResponse.usage,
                                  null,
                                  2
                                )}
                              </div>
                            )}
                            <div className="text-gray-900 whitespace-pre-wrap max-h-60 overflow-y-auto border-t border-gray-200 pt-2 mt-2">
                              {factCheckResult.debug.openaiResponse.raw}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

