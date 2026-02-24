# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

VoxSight -- voice-driven visual web navigator Chrome extension for the Gemini Live Agent Challenge hackathon (UI Navigator track, deadline 2026-03-17). Uses Gemini multimodal vision to analyze page screenshots and execute actions via voice commands.

## Build & Run

```bash
# Extension (Chrome MV3)
cd extension && npm run build          # esbuild -> extension/dist/
# Load extension/dist/ as unpacked extension in chrome://extensions/

# Backend (Node.js WebSocket + Gemini API)
cd backend && cp .env.example .env     # set GEMINI_API_KEY
cd backend && npx tsx server.ts        # dev server on :8080
cd backend && npm run build && npm start  # production (tsc -> dist/)

# E2E smoke test (requires backend running)
cd backend && node test-e2e.mjs ../test-screenshot.jpg
cd backend && node test-action.mjs ../test-screenshot.jpg "Click on Gmail"
```

## Architecture

```
extension/
  src/
    sidepanel/main.ts   -- Side Panel UI, WebSocket client, voice I/O, screenshot trigger
    background/index.ts  -- Service Worker: captureVisibleTab, sidePanel.open, keyboard shortcuts
    content/index.ts     -- Action executor: click/type/scroll/hover/navigate + highlight overlay
    shared/types.ts      -- All message types (Extension <-> Background <-> Backend)
    shared/constants.ts  -- URLs, screenshot config, storage keys
  build.mjs             -- esbuild bundler (3 entry points: background ESM, content IIFE, sidepanel ESM)
  manifest.json         -- Source manifest (build.mjs rewrites paths into dist/)

backend/
  server.ts             -- HTTP health check + WebSocketServer, session management, Live/Legacy routing
  live-agent.ts         -- Gemini Live API client (ai.live.connect, function declarations, bidi streaming)
  agent.ts              -- Legacy Gemini agent (generateContent, structured JSON output, fallback)
  auth.ts               -- HMAC-SHA256 WebSocket authentication
```

## Key Data Flow

### Live API Mode (Production, Cloud Run)

1. Side Panel finds scriptable web tab via `findWebTab()` (skips chrome://, about:, Web Store)
2. Side Panel sends `{ action: 'captureScreenshot', tabId }` to Background Service Worker
3. Background calls `captureVisibleTab(windowId)` + `executeScript` for viewport info
4. Side Panel resizes screenshot to max 1280px via canvas, sends to Backend via WebSocket
5. Backend sends screenshot via `session.sendRealtimeInput()` + text via `session.sendClientContent()`
6. Gemini responds with text parts (streamed) and/or function calls (tool_call)
7. Backend forwards tool_call to Side Panel; Side Panel executes via Content Script
8. Content Script converts screenshot-space coordinates to CSS via `coord / devicePixelRatio`
9. Side Panel sends tool_response + post-action screenshot back for verification

### Legacy Mode (Local dev with proxy, or `USE_LIVE_API=false`)

Same as steps 1-4, then:
5. Backend calls `generateContent` with structured JSON output `{ text, actions[] }`
6. Side Panel displays text, speaks via TTS, forwards each action to Content Script
7. Content Script converts coordinates, executes actions

## Important Constraints

- `captureVisibleTab` cannot capture chrome://, about:, devtools:// pages -- always filter tabs first
- `captureVisibleTab` captures the **visible** tab in a window; if a chrome:// tab is active, activate the target web tab first via `chrome.tabs.update(tabId, { active: true })`
- Content scripts only inject into pages opened **after** extension load; user must refresh pre-existing tabs
- MV3 Service Worker is killed after ~30s idle; WebSocket lives in Side Panel (persistent DOM), not SW
- Backend needs `HTTPS_PROXY` for Gemini API access from China; configured via `undici.ProxyAgent` + `setGlobalDispatcher`
- Gemini models: `gemini-live-2.5-flash-preview` (Live API), `gemini-2.5-flash` (legacy fallback)
- Live API WebSocket bypasses undici proxy -- set `USE_LIVE_API=false` when using HTTP proxy locally
- Screenshot coordinates are in image pixel space; content script divides by `devicePixelRatio` for CSS pixels

## Gotchas

| Issue | Fix |
|-------|-----|
| `captureVisibleTab` fails on chrome:// tabs | `findWebTab()` filters to http/https only; pass `tabId` explicitly |
| `@google/genai` SDK ignores `HTTP_PROXY` env | Use `undici.setGlobalDispatcher(new ProxyAgent(url))` before any fetch |
| `SpeechRecognition` types missing in TypeScript | `src/shared/speech.d.ts` declares interfaces + Window augmentation |
| Content script not responding on old tabs | User must refresh page after extension install/reload |
| `executeScript` fails on Chrome Web Store pages | `isScriptableUrl()` checks URL prefix and hostname; falls back to `tab.width`/`tab.height` |
| Live API WebSocket hangs with HTTP proxy | `undici.ProxyAgent` only patches fetch, not WebSocket. Set `USE_LIVE_API=false` for local dev |
| `elementFromPoint` returns null | Content script searches nearby coordinates (+-10px spiral) via `findNearbyElement()` |
| Gemini returns out-of-bounds coordinates | `sanitizeActions()` validates x/y against screenshot dimensions; removes invalid actions |
