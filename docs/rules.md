---
alwaysApply: true
---

# Project: Fiber (Plasmo + React + Tailwind)

## 1. Project Context
- Framework: Plasmo (Browser Extension SDK).
- Library: React 18, TypeScript, Tailwind CSS.
- Architecture: Client (Content Scripts UI) <-> Backend (Next.js API).
- Design: Minimalist, Clean, "Dub.co" style.

## 2. Coding Principles (Clean Code & Scalability)
- Component-Based:
  - Break UI into small, reusable React components (e.g., `ScoreBadge`, `SummaryCard`).
  - Keep components in the same file if small, or extract to `components/` if reused.
- Hooks & State:
  - Use `swr` or `tanstack-query` for data fetching (optional but recommended) or standard `useEffect` + `fetch` for MVP.
  - STRICTLY type all `useState` and Props interfaces.
- Tailwind First:
  - No `.css` files (except global directives). Use utility classes for everything.
  - Use `clsx` or `tailwind-merge` for conditional class names.
- Plasmo Specifics:
  - Always export `PlasmoCSConfig` in content scripts.
  - Use `getStyle` from Plasmo to inject Tailwind CSS into Shadow DOM.
  - Do NOT use `document.querySelector` to find React elements. Use Refs.

## 3. UI/UX Design System (Tailwind Implementation)
*Ref: Minimalist, Clean, Grayscale, Airy.*

### Tailwind Class Mapping
- Colors:
  - Surface: `bg-white` (Main), `bg-gray-50` (Subtle backgrounds).
  - Text: `text-gray-900` (Primary), `text-gray-500` (Secondary).
  - Borders: `border border-gray-200`.
  - Accents: `bg-black text-white` (Primary Actions).
- Shapes & Shadows:
  - Cards: `rounded-xl shadow-sm` (Subtle) or `shadow-lg` (Floating modals).
  - Buttons: `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:bg-gray-100`.
- Fact Check Trust Levels:
  - High Trust: `text-green-700 bg-green-50 border-green-200`.
  - Low Trust: `text-red-700 bg-red-50 border-red-200`.
  - Neutral: `text-yellow-700 bg-yellow-50 border-yellow-200`.

### Specific Component Rules
- Sidebar (Summary):
  - `fixed top-0 right-0 h-full w-[400px] bg-white shadow-2xl z-50 border-l border-gray-200 p-6 overflow-y-auto transform transition-transform`.
- Popover (Fact Check):
  - `absolute z-50 w-80 bg-white rounded-xl shadow-xl border border-gray-200 p-4 animate-in fade-in zoom-in-95`.

## 4. Implementation Rules 
- When creating Content Scripts (`contents/*.tsx`):
  - Always include the CSS import block for Tailwind to work in Shadow DOM:
    ```tsx
    import cssText from "data-text:~/contents/style.css"
    export const getStyle = () => {
      const style = document.createElement("style")
      style.textContent = cssText
      return style
    }
    ```
- When calling APIs:
  - Use `fetch` directly to `http://localhost:3000/api/...` (for Dev) or Production URL.
  - Handle Loading states explicitly (`isLoading && <Skeleton />`).
- When generating UI:
  - Always prioritize the "Dub.co" aesthetic: lots of whitespace, subtle borders, no distinct background colors unless necessary.

## 5. Error Handling & Types
- Define a shared `types.ts` for API responses:
  ```typescript
  interface FactCheckResponse {
    score: number;
    reason: string;
    sources: string[];
  }