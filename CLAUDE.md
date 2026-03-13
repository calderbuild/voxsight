# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

VoxSight -- voice-driven visual web navigator Chrome extension for the Gemini Live Agent Challenge hackathon (UI Navigator track). Uses Gemini multimodal vision to analyze page screenshots and execute actions via voice commands.

## Build & Run

```bash
# Extension (Chrome MV3)
cd extension && npm install
npm run build              # esbuild -> extension/dist/
# Load extension/dist/ as unpacked extension in chrome://extensions/

# Backend (Node.js WebSocket + Gemini API)
cd backend && npm install
cp .env.example .env       # set GEMINI_API_KEY
npx tsx server.ts          # dev server on :8080
npm run build && npm start # production (tsc -> dist/)

# Type-check (use npm run build, NOT bare tsc -- skipLibCheck is required)
cd extension && npx tsc --noEmit   # extension types
cd backend && npm run build        # backend types (skipLibCheck in tsconfig)

# E2E smoke test (requires backend running on :8080)
cd backend && node test-e2e.mjs ../test-screenshot.jpg
cd backend && node test-action.mjs ../test-screenshot.jpg "Click on Gmail"

# Deploy to Cloud Run
./deploy.sh                # requires gcloud auth + billing enabled
```

## Architecture

Two independent npm packages with no shared node_modules:

```
extension/               # Chrome MV3 extension (esbuild bundled)
  build.mjs              # 3 entry points: background ESM, content IIFE, sidepanel ESM
  manifest.json          # Source manifest (build.mjs rewrites paths into dist/)
  src/
    sidepanel/main.ts    # Side Panel UI, WebSocket client, voice I/O, screenshot trigger
    background/index.ts  # Service Worker: captureVisibleTab, sidePanel.open, keyboard shortcuts
    content/index.ts     # Action executor: click/type/scroll/hover/navigate + highlight overlay
    shared/types.ts      # All message types (Extension <-> Background <-> Backend)
    shared/constants.ts  # URLs, screenshot config, storage keys

backend/                 # Node.js WebSocket server + Gemini API
  server.ts              # HTTP health + WebSocketServer, session mgmt, Live/Legacy routing
  live-agent.ts          # Gemini Live API client (ai.live.connect, function declarations, bidi streaming)
  agent.ts               # Legacy Gemini agent (generateContent, structured JSON, fallback)
  auth.ts                # HMAC-SHA256 WebSocket authentication
```

## Key Data Flow

### Live API Mode (Production / Cloud Run, `USE_LIVE_API=true`)

1. Side Panel finds scriptable tab via `findWebTab()` (skips chrome://, about:, Web Store)
2. Side Panel -> Background: `captureScreenshot` -> `captureVisibleTab(windowId)` + viewport info
3. Side Panel resizes screenshot to max 1280px via canvas, sends to Backend via WebSocket
4. Backend: `session.sendRealtimeInput()` (screenshot) + `session.sendClientContent()` (text)
5. Gemini responds with streamed text and/or `tool_call` (function calling)
6. Backend forwards `tool_call` to Side Panel; Side Panel executes via Content Script
7. Content Script converts screenshot-space coords to CSS via `coord / devicePixelRatio`
8. Side Panel sends `tool_response` + post-action screenshot back for verification

### Legacy Mode (Local dev with proxy, `USE_LIVE_API=false`)

Steps 1-3 same, then Backend calls `generateContent` with structured JSON output `{ text, actions[] }`.

## Important Constraints

- `captureVisibleTab` cannot capture chrome://, about:, devtools:// -- always filter tabs first
- If a chrome:// tab is active, activate the target web tab first via `chrome.tabs.update(tabId, { active: true })`
- Content scripts only inject into pages opened **after** extension load; user must refresh pre-existing tabs
- MV3 Service Worker dies after ~30s idle; WebSocket lives in Side Panel (persistent DOM), not SW
- Backend needs `HTTPS_PROXY` for Gemini API behind China firewall; configured via `undici.ProxyAgent`
- Live API WebSocket bypasses undici proxy -- set `USE_LIVE_API=false` when using HTTP proxy locally
- Screenshot coordinates are in image pixel space; content script divides by `devicePixelRatio` for CSS pixels
- `@google/genai` SDK v1.42.0+ required for Live API (`ai.live.connect`)
- Both tsconfigs use `skipLibCheck: true` -- required to avoid errors from `@google/genai` dependency typings

## Gotchas

| Issue | Fix |
|-------|-----|
| `captureVisibleTab` fails on chrome:// tabs | `findWebTab()` filters to http/https; pass `tabId` explicitly |
| `@google/genai` SDK ignores `HTTP_PROXY` | `undici.setGlobalDispatcher(new ProxyAgent(url))` before any fetch |
| `SpeechRecognition` types missing | `src/shared/speech.d.ts` declares interfaces + Window augmentation |
| Content script not responding on old tabs | Refresh page after extension install/reload |
| `executeScript` fails on Web Store pages | `isScriptableUrl()` checks URL; falls back to `tab.width`/`tab.height` |
| Live API hangs with HTTP proxy | `undici.ProxyAgent` only patches fetch, not WebSocket. Use `USE_LIVE_API=false` |
| `elementFromPoint` returns null | Content script spirals nearby coords (+-10px) via `findNearbyElement()` |
| Gemini returns out-of-bounds coords | `sanitizeActions()` validates x/y against screenshot dimensions |
