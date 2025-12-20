/**
 * Site Configuration
 * 
 * Centralized configuration for all supported news sites.
 * Makes adding new sites trivial and eliminates hardcoded site-specific logic.
 */

/**
 * Configuration for a specific news site
 */
export interface SiteConfig {
    /** Site domain (e.g., "vnexpress.net") */
    domain: string

    /** Human-readable site name */
    name: string

    /** CSS selectors for article content */
    articleSelectors: string[]

    /** CSS selectors for article metadata */
    metadataSelectors: string[]

    /** CSS selectors for main content */
    contentSelectors: string[]

    /** URL patterns that indicate an article page */
    urlPatterns: RegExp[]
}

/**
 * All supported news sites
 */
export const SITE_CONFIGS: SiteConfig[] = [
    {
        domain: "vnexpress.net",
        name: "VnExpress",
        articleSelectors: [
            ".fck_detail",
            "article",
            '[itemtype="http://schema.org/NewsArticle"]',
        ],
        metadataSelectors: [
            ".date-time",
            ".author-name",
            'meta[property="article:published_time"]',
        ],
        contentSelectors: [
            ".fck_detail",
            ".sidebar-1",
        ],
        urlPatterns: [
            /\/[\w-]+-\d+\.html?$/i,
        ],
    },
    {
        domain: "tuoitre.vn",
        name: "Tuổi Trẻ",
        articleSelectors: [
            ".content-detail",
            "article",
            '[itemtype="http://schema.org/NewsArticle"]',
        ],
        metadataSelectors: [
            ".date-time",
            ".author",
            'meta[property="article:published_time"]',
        ],
        contentSelectors: [
            ".content-detail",
            ".detail-content",
        ],
        urlPatterns: [
            /\/[\w-]+-\d+$/i,
            /\/[\w-]+-\d+\.htm/i,
        ],
    },
    {
        domain: "dantri.com.vn",
        name: "Dân Trí",
        articleSelectors: [
            ".dt-news__content",
            "article",
            '[itemtype="http://schema.org/NewsArticle"]',
        ],
        metadataSelectors: [
            ".dt-news__time",
            ".dt-news__author",
            'meta[property="article:published_time"]',
        ],
        contentSelectors: [
            ".dt-news__content",
            ".dt-news__body",
        ],
        urlPatterns: [
            /-\d{7,}\.htm/i,
        ],
    },
    {
        domain: "thanhnien.vn",
        name: "Thanh Niên",
        articleSelectors: [
            ".detail-content",
            "article",
            '[itemtype="http://schema.org/NewsArticle"]',
        ],
        metadataSelectors: [
            ".date",
            ".author",
            'meta[property="article:published_time"]',
        ],
        contentSelectors: [
            ".detail-content",
            ".content",
        ],
        urlPatterns: [
            /\/[\w-]+\/[\w-]+-\d+/i,
        ],
    },
    {
        domain: "vietnamnet.vn",
        name: "VietnamNet",
        articleSelectors: [
            ".maincontent",
            "article",
            '[itemtype="http://schema.org/NewsArticle"]',
        ],
        metadataSelectors: [
            ".time",
            ".author",
            'meta[property="article:published_time"]',
        ],
        contentSelectors: [
            ".maincontent",
            ".ArticleContent",
        ],
        urlPatterns: [
            /\/[\w-]+-\d+\.html/i,
        ],
    },
    {
        domain: "laodong.vn",
        name: "Lao Động",
        articleSelectors: [
            ".detail-content",
            "article",
            '[itemtype="http://schema.org/NewsArticle"]',
        ],
        metadataSelectors: [
            ".author-info",
            ".time",
            'meta[property="article:published_time"]',
        ],
        contentSelectors: [
            ".detail-content",
            ".article-content",
        ],
        urlPatterns: [
            /\/[\w-]+-\d+\.ldo/i,
        ],
    },
    {
        domain: "tienphong.vn",
        name: "Tiền Phong",
        articleSelectors: [
            ".article-content",
            "article",
            '[itemtype="http://schema.org/NewsArticle"]',
        ],
        metadataSelectors: [
            ".article-time",
            ".article-author",
            'meta[property="article:published_time"]',
        ],
        contentSelectors: [
            ".article-content",
            ".detail-content",
        ],
        urlPatterns: [
            /\/[\w-]+-\d+\.tpo/i,
        ],
    },
    {
        domain: "vtv.vn",
        name: "VTV",
        articleSelectors: [
            ".content-detail",
            "article",
            '[itemtype="http://schema.org/NewsArticle"]',
        ],
        metadataSelectors: [
            ".time",
            ".author",
            'meta[property="article:published_time"]',
        ],
        contentSelectors: [
            ".content-detail",
            ".detail-content",
        ],
        urlPatterns: [
            /\/[\w-]+-\d+\.htm/i,
        ],
    },
    {
        domain: "nld.com.vn",
        name: "Người Lao Động",
        articleSelectors: [
            ".detail-content",
            "article",
            '[itemtype="http://schema.org/NewsArticle"]',
        ],
        metadataSelectors: [
            ".author-info",
            ".time",
            'meta[property="article:published_time"]',
        ],
        contentSelectors: [
            ".detail-content",
            ".article-content",
        ],
        urlPatterns: [
            /\/[\w-]+-\d+\.htm/i,
        ],
    },
]

/**
 * Get site configuration for a hostname
 * 
 * @param hostname - Site hostname (e.g., "vnexpress.net" or "www.vnexpress.net")
 * @returns Site configuration or null if not found
 */
export function getSiteConfig(hostname: string): SiteConfig | null {
    // Remove www. prefix if present
    const cleanHostname = hostname.replace(/^www\./, "")

    return SITE_CONFIGS.find(config => config.domain === cleanHostname) || null
}

/**
 * Check if a hostname is supported
 * 
 * @param hostname - Site hostname
 * @returns True if site is supported
 */
export function isSupportedSite(hostname: string): boolean {
    return getSiteConfig(hostname) !== null
}

/**
 * Get all supported domains
 * 
 * @returns Array of supported domains
 */
export function getSupportedDomains(): string[] {
    return SITE_CONFIGS.map(config => config.domain)
}

/**
 * Get all match patterns for manifest
 * 
 * @returns Array of match patterns for Chrome extension manifest
 */
export function getMatchPatterns(): string[] {
    return SITE_CONFIGS.map(config => `https://${config.domain}/*`)
}
