/**
 * DOM utility functions for the extension
 * 
 * Provides reusable utilities for DOM manipulation, positioning,
 * and content detection.
 */

import type { ElementDimensions, ViewportPosition, WaitForContentOptions } from "./extension-types"
import { THRESHOLDS, TIMEOUTS } from "./constants"

/**
 * Calculate tooltip position that stays within viewport bounds
 * 
 * @param selectionRect - Bounding rectangle of the text selection
 * @param tooltipDimensions - Width and height of the tooltip
 * @returns Position in viewport coordinates
 */
export function calculateTooltipPosition(
    selectionRect: DOMRect,
    tooltipDimensions: ElementDimensions
): ViewportPosition {
    const { width, height } = tooltipDimensions
    const offset = 12

    // Center horizontally on selection, but keep within viewport
    const left = Math.max(
        offset,
        Math.min(
            selectionRect.left + selectionRect.width / 2 - width / 2,
            window.innerWidth - width - offset
        )
    )

    // Position above selection, but keep within viewport
    const top = Math.max(
        offset,
        Math.min(
            selectionRect.top - height - offset,
            window.innerHeight - height - offset
        )
    )

    return { left, top }
}

/**
 * Calculate modal position that stays within viewport bounds
 * 
 * @param selectionRect - Bounding rectangle of the text selection
 * @param modalDimensions - Width and height of the modal
 * @returns Position in viewport coordinates
 */
export function calculateModalPosition(
    selectionRect: DOMRect,
    modalDimensions: ElementDimensions
): ViewportPosition {
    const { width, height } = modalDimensions
    const offset = 16

    // Center horizontally on selection, but keep within viewport
    const left = Math.max(
        offset,
        Math.min(
            selectionRect.left + selectionRect.width / 2 - width / 2,
            window.innerWidth - width - offset
        )
    )

    // Position below selection, but keep within viewport
    const top = Math.max(
        offset,
        Math.min(
            selectionRect.top + 20,
            window.innerHeight - height - offset
        )
    )

    return { left, top }
}

/**
 * Wait for content to be present in the DOM
 * 
 * Retries checking for content with configurable delays and retry counts.
 * Useful for waiting for dynamically loaded content.
 * 
 * @param selectors - Array of CSS selectors to check for
 * @param options - Configuration options
 * @returns Promise that resolves to true if content found, false otherwise
 */
export async function waitForContent(
    selectors: string[],
    options: WaitForContentOptions = {}
): Promise<boolean> {
    const {
        maxRetries = THRESHOLDS.MAX_CONTENT_RETRIES,
        retryDelay = TIMEOUTS.CONTENT_RETRY_DELAY,
        minContentLength = THRESHOLDS.MIN_BODY_CONTENT_LENGTH,
    } = options

    for (let i = 0; i < maxRetries; i++) {
        // Check if document is ready
        if (document.readyState === "complete") {
            // Check for any of the provided selectors
            const hasContent = selectors.some(selector =>
                document.querySelector(selector) !== null
            )

            if (hasContent) {
                // Additional small delay to ensure content is fully rendered
                await new Promise(resolve => setTimeout(resolve, TIMEOUTS.CONTENT_WAIT_DELAY))
                return true
            }

            // Fallback: check if body has substantial content
            const bodyContent = document.body.textContent?.trim().length ?? 0
            if (bodyContent > minContentLength) {
                await new Promise(resolve => setTimeout(resolve, TIMEOUTS.CONTENT_WAIT_DELAY))
                return true
            }
        }

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, retryDelay))
    }

    return false
}

/**
 * Get current text selection information
 * 
 * @returns Selection text and position, or null if no valid selection
 */
export function getSelectionInfo(): { text: string; position: { x: number; y: number } } | null {
    const selection = window.getSelection()
    const selectedText = selection?.toString().trim()

    if (!selectedText || selectedText.length < THRESHOLDS.MIN_SELECTION_LENGTH) {
        return null
    }

    if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        const rect = range.getBoundingClientRect()

        return {
            text: selectedText,
            position: {
                x: rect.left + rect.width / 2,
                y: rect.top
            }
        }
    }

    return null
}

/**
 * Clear current text selection
 */
export function clearSelection(): void {
    window.getSelection()?.removeAllRanges()
}

/**
 * Check if an element is visible in the viewport
 * 
 * @param element - DOM element to check
 * @returns True if element is visible
 */
export function isElementVisible(element: Element): boolean {
    const rect = element.getBoundingClientRect()
    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= window.innerHeight &&
        rect.right <= window.innerWidth
    )
}

/**
 * Debounce a function call
 * 
 * @param fn - Function to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
    fn: T,
    delay: number
): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    return (...args: Parameters<T>) => {
        if (timeoutId) {
            clearTimeout(timeoutId)
        }

        timeoutId = setTimeout(() => {
            fn(...args)
            timeoutId = null
        }, delay)
    }
}
