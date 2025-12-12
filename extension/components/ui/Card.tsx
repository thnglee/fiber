import React from "react"
import { cn } from "~/lib/utils"

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated"
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = "default",
  className,
  ...props
}) => {
  const variants = {
    default: "rounded-xl shadow-sm border border-gray-200",
    elevated: "rounded-xl shadow-lg border border-gray-200"
  }

  return (
    <div
      className={cn(
        "bg-white p-6",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

