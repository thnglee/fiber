import { Readability } from "@mozilla/readability"

/**
 * Detect if the current page is an article page or a list/homepage
 * Uses multiple heuristics: URL patterns, DOM selectors, and content analysis
 */
export async function isArticlePage(): Promise<boolean> {
    // Strategy 1: URL Pattern Matching
    const url = window.location.href
    const pathname = window.location.pathname

    // Common article URL patterns for Vietnamese news sites
    const articleUrlPatterns = [
        /\/[\w-]+-\d+\.html?$/i, // vnexpress: /article-title-1234567.html
        /\/[\w-]+-\d+$/i, // tuoitre: /article-title-1234567
        /-\d{7,}\.htm/i, // dantri: /article-title-1234567.htm
        /\/[\w-]+\/[\w-]+-\d+/i, // thanhnien: /category/article-title-1234567
        /\/post\d+/i, // generic post pattern
        /\/bai-viet\//i, // Vietnamese "article" path
        /\/tin-tuc\//i, // Vietnamese "news" path
        /\/chi-tiet\//i, // Vietnamese "detail" path
    ]

    const hasArticleUrlPattern = articleUrlPatterns.some(pattern => pattern.test(pathname))

    // Strategy 2: Check for article-specific DOM elements
    const articleSelectors = [
        "article",
        ".fck_detail", // vnexpress
        ".content-detail", // tuoitre
        ".dt-news__content", // dantri
        ".detail-content", // thanhnien
        ".article-content",
        ".post-content",
        '[itemtype="http://schema.org/Article"]',
        '[itemtype="http://schema.org/NewsArticle"]',
    ]

    const hasArticleElement = articleSelectors.some(selector =>
        document.querySelector(selector) !== null
    )

    // Strategy 3: Check for article metadata elements
    const metadataSelectors = [
        ".date-time", // publish date
        ".author-name", // author
        ".share-buttons", // social share
        'meta[property="article:published_time"]',
        'meta[property="og:type"][content="article"]',
        ".article-meta",
        ".post-meta",
    ]

    const hasMetadata = metadataSelectors.some(selector =>
        document.querySelector(selector) !== null
    )

    // Strategy 4: Content length heuristic using Readability
    let hasSubstantialContent = false
    try {
        // Wait a bit for content to load
        await new Promise(resolve => setTimeout(resolve, 300))

        const documentClone = document.cloneNode(true) as Document
        const reader = new Readability(documentClone)
        const article = reader.parse()

        if (article && article.textContent) {
            // Articles typically have >1000 characters of readable content
            // Homepages/list pages will have fragmented text from multiple article snippets
            hasSubstantialContent = article.textContent.length > 1000
        }
    } catch (error) {
        console.warn("Readability check failed:", error)
    }

    // Decision logic: Combine all heuristics
    // If URL pattern matches AND (has article element OR has metadata), it's likely an article
    // OR if it has substantial readable content, it's likely an article
    const isArticle = (hasArticleUrlPattern && (hasArticleElement || hasMetadata)) ||
        (hasArticleElement && hasSubstantialContent)

    console.log("Article detection:", {
        url: pathname,
        hasArticleUrlPattern,
        hasArticleElement,
        hasMetadata,
        hasSubstantialContent,
        isArticle
    })

    return isArticle
}
