import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Fiber API",
  description: "Backend API for Fiber browser extension",
  icons: {
    icon: "/icon.png",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

