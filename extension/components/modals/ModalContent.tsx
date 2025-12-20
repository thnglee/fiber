/**
 * Reusable Modal Content Components
 * 
 * Provides consistent UI components for modal content sections:
 * - Selected text preview
 * - Loading states with skeletons
 * - Error states with retry button
 */

import React, { type ReactNode } from "react"
import { Skeleton } from "~/components/ui/Skeleton"
import { Button } from "~/components/ui/Button"

interface SelectedTextPreviewProps {
    text: string
    maxLength?: number
}

/**
 * Display selected text with character limit
 */
export const SelectedTextPreview: React.FC<SelectedTextPreviewProps> = ({
    text,
    maxLength = 150,
}) => {
    const displayText = text.length > maxLength
        ? `${text.substring(0, maxLength)}...`
        : text

    return (
        <div className="mb-5 p-3 bg-gray-50 rounded-lg text-sm text-gray-600 border border-gray-200 leading-relaxed">
            <span className="font-medium text-gray-500 text-xs uppercase tracking-wide mb-1 block">
                Đoạn văn đã chọn:
            </span>
            <p className="mt-1.5">"{displayText}"</p>
        </div>
    )
}

interface LoadingStateProps {
    /** Optional custom loading content */
    children?: ReactNode
}

/**
 * Default loading state with skeletons
 */
export const LoadingState: React.FC<LoadingStateProps> = ({ children }) => {
    if (children) {
        return <>{children}</>
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-28" variant="rectangular" />
                <Skeleton className="h-4 w-20" variant="text" />
            </div>
            <div className="space-y-2">
                <Skeleton className="h-4 w-full" variant="text" />
                <Skeleton className="h-4 w-full" variant="text" />
                <Skeleton className="h-4 w-4/5" variant="text" />
            </div>
            <div className="space-y-2 pt-2">
                <Skeleton className="h-3 w-24" variant="text" />
                <Skeleton className="h-3 w-32" variant="text" />
                <Skeleton className="h-3 w-28" variant="text" />
            </div>
        </div>
    )
}

interface ErrorStateProps {
    /** Error message to display */
    message: string

    /** Callback when retry button is clicked */
    onRetry: () => void
}

/**
 * Error state with retry button
 */
export const ErrorState: React.FC<ErrorStateProps> = ({ message, onRetry }) => {
    return (
        <div className="space-y-4">
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700 font-medium mb-1">Đã xảy ra lỗi</p>
                <p className="text-xs text-red-600">{message}</p>
            </div>
            <Button
                onClick={onRetry}
                variant="primary"
                size="sm"
                className="w-full"
            >
                Thử lại
            </Button>
        </div>
    )
}
