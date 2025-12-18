## 1. Project Overview
Name: Fiber
Type: Browser Extension (Chrome/Edge/Brave)
Framework: Plasmo (The "Next.js" for Extensions).
Goal: Create a high-quality, scalable MVP in 3 days.
Functionality:
1.  Auto-Summarize: Automatically summarizes news articles upon loading using LLMs.
2.  Fact-Check: Allows users to highlight text and verify its accuracy against trusted Vietnamese sources.

## 2. Tech Stack (Scalable & Fast)
*   Extension Framework: Plasmo (React + TypeScript).
    *   Handles HMR, bundling, and Manifest V3 automatically.
*   UI Library: React (Functional Components, Hooks).
*   Styling: Tailwind CSS (Utility-first, fast implementation of Dub.co style).
*   Content Extraction: `@mozilla/readability`.
*   Backend / API Proxy:
    *   Framework: Next.js (App Router) on Vercel.
    *   Purpose: Securely call LLM APIs & RAG Search.
*   AI Services:
    *   LLM: OpenAI GPT-4o-mini.
    *   RAG: Tavily AI API.

## 3. Core Features & Implementation (Plasmo approach)

### Feature A: Sidebar Summary (Content Script UI)
*   Type: `PlasmoCSUI` (Content Script UI).
*   Trigger: User visits whitelisted domains (vnexpress, tuoitre, etc.).
*   Component: `<SummarySidebar />`.
*   Logic:
    1.  React `useEffect` detects page load.
    2.  `Readability` parses DOM.
    3.  Call Backend API.
    4.  Render result in a Sidebar (Slide-over) injected via Shadow DOM.

### Feature B: Contextual Fact-Check (Inline Overlay)
*   Type: `PlasmoCSUI` (Content Script UI).
*   Trigger: User selects text on the page.
*   Component: `<FactCheckTooltip />` & `<FactCheckModal />`.
*   Logic:
    1.  Listen to mouse events.
    2.  Show "🔍 Check" tooltip near selection coordinates.
    3.  On click -> Open Modal.
    4.  Call Backend -> Render Trust Score & Analysis.

## 4. Project File Structure (Plasmo Standard)

```text
/fiber
├── extension/                  # Plasmo Root
│   ├── assets/                 # Icons
│   ├── contents/               # Content Scripts (The UI logic)
│   │   ├── summary-sidebar.tsx # Sidebar Logic
│   │   ├── fact-checker.tsx    # Fact Check Logic & Tooltip
│   │   └── style.css           # CSS imports (Tailwind directives)
│   ├── components/             # Reusable React Components
│   │   ├── ui/                 # Buttons, Cards, Modals (Dub.co style)
│   │   └── icons/
│   ├── lib/
│   │   ├── api-client.ts       # Fetch wrappers
│   │   └── utils.ts
│   ├── background.ts           # Service Worker
│   ├── popup.tsx               # Extension Popup (Settings)
│   ├── tailwind.config.js
│   └── package.json
├── backend/                    # Next.js API
│   ├── app/api/...
│   └── ...
└── instructions.md
```

# 5. Development Plan (3 Phases)
## Phase 1: Foundation & Sidebar (Day 1)
Setup: Initialize Plasmo + Tailwind CSS.
UI: Create <SummarySidebar /> component using Tailwind (Fixed right, simple animation).
Logic: Implement Readability in the content script.
Backend: Setup Next.js /api/summarize (OpenAI).
Integration: Connect Sidebar to Backend to show dummy summary.

## Phase 2: Fact Check & RAG (Day 2)
Interactions: Build the text selection logic in React (Calculate getBoundingClientRect for tooltip positioning).
Backend: Setup /api/fact-check (Tavily + OpenAI).
UI: Build <FactCheckModal /> with Trust Meter (Green/Red colors).
State: Handle Loading states (Skeletons) inside the React component.

