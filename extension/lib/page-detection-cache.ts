/**
 * Page Detection Cache
 * 
 * Caches page detection results to avoid expensive Readability parsing
 * on every check. Uses LRU eviction and TTL-based expiration.
 */

import type { PageDetectionResult } from "./extension-types"
import { THRESHOLDS } from "./constants"

interface CacheEntry {
    result: PageDetectionResult
    timestamp: number
}

/**
 * LRU cache for page detection results
 */
export class PageDetectionCache {
    private cache: Map<string, CacheEntry> = new Map()
    private readonly maxEntries: number
    private readonly ttl: number

    constructor(
        maxEntries: number = THRESHOLDS.MAX_CACHE_ENTRIES,
        ttl: number = THRESHOLDS.CACHE_TTL
    ) {
        this.maxEntries = maxEntries
        this.ttl = ttl
    }

    /**
     * Generate cache key from URL and content hash
     */
    private generateKey(url: string, contentHash: string): string {
        return `${url}:${contentHash}`
    }

    /**
     * Generate content hash from page content
     * Uses first 1000 characters to detect content changes
     */
    public generateContentHash(content: string): string {
        const sample = content.substring(0, 1000)
        // Simple hash function (not cryptographic)
        let hash = 0
        for (let i = 0; i < sample.length; i++) {
            const char = sample.charCodeAt(i)
            hash = ((hash << 5) - hash) + char
            hash = hash & hash // Convert to 32-bit integer
        }
        return hash.toString(36)
    }

    /**
     * Get cached result if valid
     */
    public get(url: string, contentHash: string): PageDetectionResult | null {
        const key = this.generateKey(url, contentHash)
        const entry = this.cache.get(key)

        if (!entry) {
            return null
        }

        // Check if entry has expired
        const now = Date.now()
        if (now - entry.timestamp > this.ttl) {
            this.cache.delete(key)
            return null
        }

        // Move to end (LRU)
        this.cache.delete(key)
        this.cache.set(key, entry)

        return entry.result
    }

    /**
     * Set cache entry
     */
    public set(url: string, result: PageDetectionResult): void {
        const key = this.generateKey(url, result.contentHash)

        // Evict oldest entry if at capacity
        if (this.cache.size >= this.maxEntries) {
            const firstKey = this.cache.keys().next().value
            if (firstKey) {
                this.cache.delete(firstKey)
            }
        }

        this.cache.set(key, {
            result,
            timestamp: Date.now(),
        })
    }

    /**
     * Invalidate cache for specific URL
     */
    public invalidate(url: string): void {
        // Remove all entries for this URL (regardless of content hash)
        const keysToDelete: string[] = []

        for (const key of this.cache.keys()) {
            if (key.startsWith(`${url}:`)) {
                keysToDelete.push(key)
            }
        }

        keysToDelete.forEach(key => this.cache.delete(key))
    }

    /**
     * Clear entire cache
     */
    public clear(): void {
        this.cache.clear()
    }

    /**
     * Get cache statistics
     */
    public getStats(): { size: number; maxSize: number; hitRate?: number } {
        return {
            size: this.cache.size,
            maxSize: this.maxEntries,
        }
    }
}

// Export singleton instance
export const pageDetectionCache = new PageDetectionCache()
