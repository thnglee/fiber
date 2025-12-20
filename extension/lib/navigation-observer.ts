/**
 * Navigation Observer
 * 
 * Efficiently detects URL changes in Single Page Applications (SPAs)
 * without using inefficient polling. Uses MutationObserver and history API.
 */

import { debounce } from "./dom-utils"
import { TIMEOUTS } from "./constants"

type NavigationCallback = (url: string) => void

/**
 * Observes navigation changes in SPAs
 * 
 * Replaces inefficient polling with event-driven architecture.
 * Listens to:
 * - popstate events (back/forward navigation)
 * - pushState/replaceState (programmatic navigation)
 * - DOM mutations that indicate navigation
 */
export class NavigationObserver {
    private callbacks: Set<NavigationCallback> = new Set()
    private currentUrl: string
    private mutationObserver: MutationObserver | null = null
    private debouncedNotify: () => void

    constructor() {
        this.currentUrl = window.location.href
        this.debouncedNotify = debounce(
            () => this.notifyCallbacks(),
            TIMEOUTS.NAVIGATION_DEBOUNCE
        )
        this.init()
    }

    /**
     * Initialize observers and event listeners
     */
    private init(): void {
        // Listen to popstate (back/forward navigation)
        window.addEventListener("popstate", this.handleNavigation)

        // Intercept pushState and replaceState
        this.interceptHistoryMethods()

        // Watch for DOM changes that might indicate navigation
        this.observeDOMChanges()
    }

    /**
     * Intercept history.pushState and history.replaceState
     */
    private interceptHistoryMethods(): void {
        const originalPushState = history.pushState
        const originalReplaceState = history.replaceState

        history.pushState = (...args) => {
            originalPushState.apply(history, args)
            this.handleNavigation()
        }

        history.replaceState = (...args) => {
            originalReplaceState.apply(history, args)
            this.handleNavigation()
        }
    }

    /**
     * Observe DOM changes that might indicate navigation
     * 
     * Some SPAs change content without triggering history events
     */
    private observeDOMChanges(): void {
        this.mutationObserver = new MutationObserver(() => {
            // Check if URL has changed
            if (window.location.href !== this.currentUrl) {
                this.handleNavigation()
            }
        })

        // Observe changes to the document title and main content
        this.mutationObserver.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["href"],
        })
    }

    /**
     * Handle navigation event
     */
    private handleNavigation = (): void => {
        const newUrl = window.location.href

        if (newUrl !== this.currentUrl) {
            this.currentUrl = newUrl
            this.debouncedNotify()
        }
    }

    /**
     * Notify all registered callbacks
     */
    private notifyCallbacks(): void {
        this.callbacks.forEach(callback => {
            try {
                callback(this.currentUrl)
            } catch (error) {
                console.error("[NavigationObserver] Error in callback:", error)
            }
        })
    }

    /**
     * Subscribe to navigation changes
     * 
     * @param callback - Function to call when navigation occurs
     * @returns Unsubscribe function
     */
    public onNavigate(callback: NavigationCallback): () => void {
        this.callbacks.add(callback)

        // Return unsubscribe function
        return () => {
            this.callbacks.delete(callback)
        }
    }

    /**
     * Clean up observers and event listeners
     */
    public destroy(): void {
        window.removeEventListener("popstate", this.handleNavigation)

        if (this.mutationObserver) {
            this.mutationObserver.disconnect()
            this.mutationObserver = null
        }

        this.callbacks.clear()
    }

    /**
     * Get current URL
     */
    public getCurrentUrl(): string {
        return this.currentUrl
    }
}
