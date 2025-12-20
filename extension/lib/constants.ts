/**
 * Constants and configuration values for the extension
 * 
 * Centralizes all magic numbers, timeouts, thresholds, and configuration
 * to make the codebase more maintainable and testable.
 */

/**
 * Timeout values in milliseconds
 */
export const TIMEOUTS = {
    /** Delay after mouseup before checking selection */
    SELECTION_DELAY: 10,

    /** Delay to wait for content to render after detection */
    CONTENT_WAIT_DELAY: 300,

    /** Delay before attaching outside-click handler to prevent immediate closing */
    OUTSIDE_CLICK_DELAY: 100,

    /** Delay between content loading retries */
    CONTENT_RETRY_DELAY: 500,

    /** Debounce delay for navigation events */
    NAVIGATION_DEBOUNCE: 100,
} as const

/**
 * Threshold values for detection and validation
 */
export const THRESHOLDS = {
    /** Minimum text selection length to show tooltip */
    MIN_SELECTION_LENGTH: 10,

    /** Minimum article content length for detection */
    ARTICLE_CONTENT_LENGTH: 1000,

    /** Maximum retries for waiting for content */
    MAX_CONTENT_RETRIES: 10,

    /** Minimum body content length to consider page loaded */
    MIN_BODY_CONTENT_LENGTH: 500,

    /** Cache TTL in milliseconds (5 minutes) */
    CACHE_TTL: 5 * 60 * 1000,

    /** Maximum cache entries (LRU eviction) */
    MAX_CACHE_ENTRIES: 50,
} as const

/**
 * DOM selectors for article detection
 */
export const SELECTORS = {
    /** Generic article container selectors */
    ARTICLE: [
        "article",
        ".article-content",
        ".post-content",
        '[itemtype="http://schema.org/Article"]',
        '[itemtype="http://schema.org/NewsArticle"]',
    ],

    /** Site-specific article content selectors */
    SITE_SPECIFIC: {
        vnexpress: ".fck_detail",
        tuoitre: ".content-detail",
        dantri: ".dt-news__content",
        thanhnien: ".detail-content",
    },

    /** Article metadata selectors */
    METADATA: [
        ".date-time",
        ".author-name",
        ".share-buttons",
        'meta[property="article:published_time"]',
        'meta[property="og:type"][content="article"]',
        ".article-meta",
        ".post-meta",
    ],
} as const

/**
 * URL patterns for article detection
 */
export const URL_PATTERNS = {
    /** Common article URL patterns for Vietnamese news sites */
    ARTICLE: [
        /\/[\w-]+-\d+\.html?$/i,        // vnexpress: /article-title-1234567.html
        /\/[\w-]+-\d+$/i,               // tuoitre: /article-title-1234567
        /-\d{7,}\.htm/i,                // dantri: /article-title-1234567.htm
        /\/[\w-]+\/[\w-]+-\d+/i,        // thanhnien: /category/article-title-1234567
        /\/post\d+/i,                   // generic post pattern
        /\/bai-viet\//i,                // Vietnamese "article" path
        /\/tin-tuc\//i,                 // Vietnamese "news" path
        /\/chi-tiet\//i,                // Vietnamese "detail" path
    ],
} as const

/**
 * Modal and tooltip dimensions
 */
export const DIMENSIONS = {
    /** Tooltip dimensions */
    TOOLTIP: {
        WIDTH: 120,
        HEIGHT: 36,
        OFFSET: 12,
    },

    /** Modal dimensions */
    MODAL: {
        WIDTH: 384,  // w-96 in Tailwind
        MAX_HEIGHT: 600,
        ESTIMATED_HEIGHT: 500,
        OFFSET: 16,
    },
} as const

/**
 * Z-index values for layering
 */
export const Z_INDEX = {
    /** Backdrop overlay */
    BACKDROP: 9998,

    /** Modal and tooltip */
    MODAL: 9999,
    TOOLTIP: 9999,
} as const

/**
 * API configuration
 */
export const API = {
    /** Maximum retry attempts for failed requests */
    MAX_RETRIES: 2,

    /** Base delay for exponential backoff (ms) */
    RETRY_BASE_DELAY: 1000,

    /** Request timeout (ms) */
    TIMEOUT: 30000,
} as const
