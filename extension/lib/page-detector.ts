import { Readability } from "@mozilla/readability"
import type { PageDetectionResult } from "./extension-types"
import { pageDetectionCache } from "./page-detection-cache"
import { SELECTORS, URL_PATTERNS, THRESHOLDS, TIMEOUTS } from "./constants"
import { getSiteConfig } from "./site-config"

/**
 * Helper: Check if URL matches article patterns
 */
function hasArticleUrlPattern(pathname: string): boolean {
    return URL_PATTERNS.ARTICLE.some(pattern => pattern.test(pathname))
}

/**
 * Helper: Check for article-specific DOM elements
 */
function hasArticleElement(): boolean {
    // Check generic article selectors
    const hasGeneric = SELECTORS.ARTICLE.some(selector =>
        document.querySelector(selector) !== null
    )

    if (hasGeneric) return true

    // Check site-specific selectors
    const hostname = window.location.hostname.replace("www.", "")
    const siteKey = hostname.split(".")[0] as keyof typeof SELECTORS.SITE_SPECIFIC

    if (siteKey in SELECTORS.SITE_SPECIFIC) {
        const siteSelector = SELECTORS.SITE_SPECIFIC[siteKey]
        return document.querySelector(siteSelector) !== null
    }

    return false
}

/**
 * Helper: Check for article metadata elements
 */
function hasMetadata(): boolean {
    return SELECTORS.METADATA.some(selector =>
        document.querySelector(selector) !== null
    )
}

/**
 * Helper: Check if page has substantial readable content
 */
async function hasSubstantialContent(): Promise<{ hasContent: boolean; contentHash: string }> {
    try {
        // Wait a bit for content to load
        await new Promise(resolve => setTimeout(resolve, TIMEOUTS.CONTENT_WAIT_DELAY))

        let article: ReturnType<Readability["parse"]> = null

        // Strategy 1: Try site-specific container first (avoids full DOM clone
        // which crashes on VnExpress due to AVP-* custom web components)
        const siteSelectors = [
            ...Object.values(SELECTORS.SITE_SPECIFIC),
            ...SELECTORS.ARTICLE,
        ]
        for (const sel of siteSelectors) {
            try {
                const container = document.querySelector(sel)
                if (container && container.textContent && container.textContent.trim().length > 200) {
                    const minimalDoc = document.implementation.createHTMLDocument("article")
                    minimalDoc.body.appendChild(container.cloneNode(true))
                    minimalDoc.querySelectorAll("script,noscript,style,iframe,svg,video,audio,canvas").forEach(
                        el => el.parentNode?.removeChild(el)
                    )
                    // Strip custom web components (e.g. VnExpress AVP-* elements) that crash Readability
                    minimalDoc.querySelectorAll("*").forEach(el => {
                        if (el && el.tagName && el.tagName.includes("-")) {
                            el.parentNode?.removeChild(el)
                        }
                    })
                    const reader = new Readability(minimalDoc)
                    article = reader.parse()
                    if (article?.textContent && article.textContent.trim().length > 200) break
                    article = null
                }
            } catch (siteErr) {
                console.warn("[PageDetector] Site-specific extraction failed for", sel, siteErr)
            }
        }

        // Strategy 2: Full-document Readability
        if (!article) {
            try {
                const documentClone = document.cloneNode(true) as Document
                const REMOVE_SELECTORS = [
                    "script", "noscript", "style", "iframe",
                    "svg", "video", "audio", "canvas", "picture",
                    "[id*='ads']", "[class*='ads']",
                    "[id*='banner']", "[class*='banner']",
                    "[id*='player']", "[class*='player']",
                    "[id*='widget']", "[class*='widget']",
                ]
                try {
                    REMOVE_SELECTORS.forEach(s => {
                        documentClone.querySelectorAll(s).forEach(el => el.parentNode?.removeChild(el))
                    })
                    documentClone.querySelectorAll("*").forEach(el => {
                        if (el && el.tagName && el.tagName.includes("-")) {
                            el.parentNode?.removeChild(el)
                        }
                    })
                } catch (sanitizeErr) {
                    console.warn("[PageDetector] DOM sanitization error (non-fatal):", sanitizeErr)
                }
                const reader = new Readability(documentClone)
                article = reader.parse()
            } catch (fullDocErr) {
                console.warn("[PageDetector] Full-document Readability failed:", fullDocErr)
            }
        }

        if (article && article.textContent) {
            const textContent = article.textContent
            const contentHash = pageDetectionCache.generateContentHash(textContent)

            // Articles typically have >1000 characters of readable content
            const hasContent = textContent.length > THRESHOLDS.ARTICLE_CONTENT_LENGTH

            return { hasContent, contentHash }
        }
    } catch (error) {
        console.warn("[PageDetector] Readability check failed:", error)
    }

    return { hasContent: false, contentHash: "" }
}


/**
 * Helper: Check for strong article signals
 */
function hasStrongArticleSignals(pathname: string): boolean {
    const urlMatch = hasArticleUrlPattern(pathname)
    const elementMatch = hasArticleElement()
    const metadataMatch = hasMetadata()

    return urlMatch && (elementMatch || metadataMatch)
}

/**
 * Helper: Check for weak article signals
 */
function hasWeakArticleSignals(): boolean {
    return hasArticleElement() || hasMetadata()
}

/**
 * Detect if the current page is an article page or a list/homepage
 * 
 * Uses multiple heuristics: URL patterns, DOM selectors, and content analysis.
 * Results are cached to avoid expensive re-parsing.
 * 
 * @returns Promise resolving to true if page is an article, false otherwise
 */
export async function isArticlePage(): Promise<boolean> {
    const url = window.location.href
    const pathname = window.location.pathname

    // Try to get from cache first
    const bodyContent = document.body.textContent || ""
    const contentHash = pageDetectionCache.generateContentHash(bodyContent)
    const cached = pageDetectionCache.get(url, contentHash)

    if (cached) {
        console.log("[PageDetector] Using cached result:", cached.isArticle)
        return cached.isArticle
    }

    // Strategy 1: URL Pattern Matching
    const urlPatternMatch = hasArticleUrlPattern(pathname)

    // Strategy 2: Check for article-specific DOM elements
    const articleElementMatch = hasArticleElement()

    // Strategy 3: Check for article metadata elements
    const metadataMatch = hasMetadata()

    // Strategy 4: Content length heuristic using Readability
    const { hasContent, contentHash: finalContentHash } = await hasSubstantialContent()

    // Decision logic: Combine all heuristics
    // Strong signals: URL pattern + (element or metadata)
    // Weak signals: Element + substantial content
    const isArticle = hasStrongArticleSignals(pathname) ||
        (hasWeakArticleSignals() && hasContent)

    // Calculate confidence score
    let confidence = 0
    if (urlPatternMatch) confidence += 0.3
    if (articleElementMatch) confidence += 0.3
    if (metadataMatch) confidence += 0.2
    if (hasContent) confidence += 0.2

    const result: PageDetectionResult = {
        isArticle,
        timestamp: Date.now(),
        contentHash: finalContentHash || contentHash,
        confidence,
    }

    // Cache the result
    pageDetectionCache.set(url, result)

    console.log("[PageDetector] Detection result:", {
        url: pathname,
        urlPatternMatch,
        articleElementMatch,
        metadataMatch,
        hasContent,
        isArticle,
        confidence,
    })

    return isArticle
}
