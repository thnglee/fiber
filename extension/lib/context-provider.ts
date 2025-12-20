/**
 * Context Provider
 * 
 * Provides runtime context information to the API client.
 * Ensures that location data is always retrieved from the correct context
 * (content script, not background or service worker).
 */

import type { PageContext } from "./extension-types"

/**
 * Get current page context information
 * 
 * This function MUST be called from a content script context where
 * the window object is available. It will throw an error if called
 * from a background script or service worker.
 * 
 * @returns Page context with hostname, pathname, and href
 * @throws Error if called outside of a valid DOM context
 */
export function getPageContext(): PageContext {
    // Validate that we're in a browser context with window object
    if (typeof window === "undefined") {
        throw new Error(
            "[ContextProvider] Cannot get page context: window is undefined. " +
            "This function must be called from a content script context."
        )
    }

    // Validate that window.location exists
    if (!window.location) {
        throw new Error(
            "[ContextProvider] Cannot get page context: window.location is undefined."
        )
    }

    try {
        return {
            hostname: window.location.hostname,
            pathname: window.location.pathname,
            href: window.location.href,
        }
    } catch (error) {
        throw new Error(
            `[ContextProvider] Failed to get page context: ${error instanceof Error ? error.message : "Unknown error"}`
        )
    }
}

/**
 * Check if we're in a valid context to get page information
 * 
 * @returns True if getPageContext() can be safely called
 */
export function isValidContext(): boolean {
    return typeof window !== "undefined" && !!window.location
}
