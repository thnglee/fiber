import type { Metadata } from "next"
// import { usePathname } from 'next/navigation'; // Cannot use usePathname in Server Component directly without 'use client'
import "./globals.css"
import { Header } from "@/components/Header"; // We'll create this component

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
      <body className="min-h-screen bg-gray-50">
        <Header />
        {children}
      </body>
    </html>
  )
}

