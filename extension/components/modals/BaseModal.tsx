/**
 * Base Modal Component
 * 
 * Provides shared functionality for all modal dialogs including:
 * - Backdrop rendering
 * - Outside click detection
 * - ESC key handling
 * - Viewport-aware positioning
 * - Proper cleanup of event listeners
 */

import React, { useEffect, useRef, type ReactNode } from "react"
import { calculateModalPosition } from "~/lib/dom-utils"
import type { ElementDimensions } from "~/lib/types"
import { DIMENSIONS, Z_INDEX, TIMEOUTS } from "~/lib/constants"

interface BaseModalProps {
    /** Modal title */
    title: string

    /** Position of the triggering element (e.g., text selection) */
    position: { x: number; y: number }

    /** Callback when modal should close */
    onClose: () => void

    /** Modal content */
    children: ReactNode

    /** Optional custom width (defaults to 384px) */
    width?: number

    /** Optional custom max height (defaults to 600px) */
    maxHeight?: number
}

export const BaseModal: React.FC<BaseModalProps> = ({
    title,
    position,
    onClose,
    children,
    width = DIMENSIONS.MODAL.WIDTH,
    maxHeight = DIMENSIONS.MODAL.MAX_HEIGHT,
}) => {
    const modalRef = useRef<HTMLDivElement>(null)

    // Calculate modal position
    const selectionRect = {
        left: position.x,
        top: position.y,
        width: 0,
        height: 0,
        right: position.x,
        bottom: position.y,
        x: position.x,
        y: position.y,
    } as DOMRect
    const modalDimensions: ElementDimensions = {
        width,
        height: DIMENSIONS.MODAL.ESTIMATED_HEIGHT,
    }
    const modalPosition = calculateModalPosition(selectionRect, modalDimensions)

    // Handle outside clicks
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
                const target = event.target as HTMLElement
                // Don't close if clicking on other extension elements
                if (!target.closest('[data-plasmo-root]')) {
                    onClose()
                }
            }
        }

        // Use a small delay to prevent immediate closing when opening
        const timeoutId = setTimeout(() => {
            document.addEventListener("mousedown", handleClickOutside)
        }, TIMEOUTS.OUTSIDE_CLICK_DELAY)

        return () => {
            clearTimeout(timeoutId)
            document.removeEventListener("mousedown", handleClickOutside)
        }
    }, [onClose])

    // Handle ESC key
    useEffect(() => {
        const handleEscKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onClose()
            }
        }

        document.addEventListener("keydown", handleEscKey)
        return () => document.removeEventListener("keydown", handleEscKey)
    }, [onClose])

    return (
        <>
            {/* Backdrop overlay */}
            <div
                className="fixed inset-0 bg-black/10"
                style={{
                    zIndex: Z_INDEX.BACKDROP,
                    pointerEvents: "auto",
                }}
                onClick={onClose}
            />

            {/* Modal */}
            <div
                ref={modalRef}
                className="fixed bg-white rounded-xl shadow-xl border border-gray-200 p-6 animate-in fade-in zoom-in-95 overflow-y-auto"
                style={{
                    left: `${modalPosition.left}px`,
                    top: `${modalPosition.top}px`,
                    width: `${width}px`,
                    maxHeight: `${maxHeight}px`,
                    zIndex: Z_INDEX.MODAL,
                    pointerEvents: "auto",
                }}
                onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                }}
                onMouseDown={(e) => {
                    e.stopPropagation()
                }}
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                    <h3 className="text-base font-semibold text-gray-900">{title}</h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
                        aria-label="Đóng"
                    >
                        <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                {children}
            </div>
        </>
    )
}
