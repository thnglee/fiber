/**
 * Extension-specific types
 * 
 * These types are internal to the extension and not shared with the backend.
 * For API response types, see ../../shared/types.ts
 */

/**
 * State representing a text selection on the page
 */
export interface SelectionState {
    /** The selected text content */
    text: string
    /** Position of the selection in viewport coordinates */
    position: {
        x: number
        y: number
    }
}

/**
 * Type of modal currently displayed
 */
export type ModalType = 'fact-check' | 'summarize' | null

/**
 * Modal state with selection data
 */
export interface ModalState {
    type: ModalType
    data: SelectionState | null
}

/**
 * Result of page detection with caching metadata
 */
export interface PageDetectionResult {
    /** Whether the page is detected as an article */
    isArticle: boolean
    /** Timestamp when detection was performed */
    timestamp: number
    /** Hash of content used for cache validation */
    contentHash: string
    /** Confidence score of detection (0-1) */
    confidence: number
}

/**
 * Result of content extraction using Readability
 */
export interface ContentExtractionResult {
    /** Extracted article title */
    title: string | null
    /** Extracted article content */
    textContent: string | null
    /** Excerpt/preview of content */
    excerpt: string | null
    /** Estimated reading time in minutes */
    readingTime: number
    /** Whether extraction was successful */
    success: boolean
}

/**
 * Runtime context information for API calls
 */
export interface PageContext {
    /** Current page hostname (e.g., "vnexpress.net") */
    hostname: string
    /** Current page pathname (e.g., "/tin-tuc/article-123.html") */
    pathname: string
    /** Full URL of current page */
    href: string
}

/**
 * Configuration for waiting for content to load
 */
export interface WaitForContentOptions {
    /** Maximum number of retry attempts */
    maxRetries?: number
    /** Delay between retries in milliseconds */
    retryDelay?: number
    /** Minimum content length to consider as "loaded" */
    minContentLength?: number
}

/**
 * Dimensions for positioning calculations
 */
export interface ElementDimensions {
    width: number
    height: number
}

/**
 * Position in viewport coordinates
 */
export interface ViewportPosition {
    left: number
    top: number
}
