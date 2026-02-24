# VoxSight Architecture

## System Overview

```mermaid
graph TB
    subgraph User
        UR[User Voice/Keyboard Input]
        UF[Audio/Visual Feedback]
    end

    subgraph CE["Chrome Extension (Manifest V3)"]
        SP["Side Panel<br/>- Voice I/O (Web Speech API)<br/>- WebSocket Client<br/>- Accessibility Controls<br/>- Screenshot Compression"]
        BG["Background Service Worker<br/>- captureVisibleTab<br/>- sidePanel.open<br/>- Keyboard Shortcuts"]
        CS["Content Script<br/>- Action Executor (click/type/scroll)<br/>- Coordinate Translation (img->CSS)<br/>- Visual Highlight Overlay<br/>- Nearby Element Search"]
    end

    subgraph GCR["Google Cloud Run"]
        WS["WebSocket Server<br/>- HMAC Authentication<br/>- Session Management<br/>- Conversation History"]
        LA["Live Agent<br/>- Gemini Live API (bidi streaming)<br/>- Function Declarations (6 action types)<br/>- Tool Call Routing"]
        FA["Legacy Agent (fallback)<br/>- generateContent<br/>- Structured JSON Output<br/>- Coordinate Validation"]
    end

    subgraph GA["Gemini API"]
        GM["gemini-live-2.5-flash-preview<br/>Multimodal Vision + Tool Use"]
        GF["gemini-2.5-flash<br/>Structured JSON Output (fallback)"]
    end

    UR -->|"Voice / Text"| SP
    SP -->|"captureScreenshot(tabId)"| BG
    BG -->|"captureVisibleTab + executeScript"| CS
    SP <-->|"WebSocket + HMAC Auth"| WS
    WS --> LA
    WS -.->|"fallback"| FA
    LA <-->|"ai.live.connect()<br/>sendRealtimeInput (screenshot)<br/>sendClientContent (text)<br/>sendToolResponse (results)"| GM
    FA -->|"generateContent<br/>(screenshot + text -> JSON)"| GF
    SP -->|"executeAction(agentAction)"| CS
    CS -->|"DOM: click/type/scroll/hover/navigate"| Browser["Web Page"]
    SP -->|"TTS + Visual UI"| UF
```

## Data Flow

### Live API Mode (Production)

1. **User Input**: Voice (Web Speech API STT) or keyboard text
2. **Screenshot**: Side Panel requests Background SW to call `captureVisibleTab(windowId)` -> JPEG
3. **Compression**: Side Panel resizes to max 1280px width via canvas
4. **Transport**: WebSocket with HMAC auth (timestamp + nonce + SHA-256 signature)
5. **Live Session**: Backend sends screenshot via `sendRealtimeInput()` + text via `sendClientContent()`
6. **Gemini Response**: Model returns text parts (streamed) and/or function calls (tool use)
7. **Action Execution**: Side Panel receives `tool_call`, routes to Content Script via `chrome.tabs.sendMessage`
8. **Content Script**: Translates screenshot coordinates to CSS (`imgCoord / devicePixelRatio`), executes DOM action
9. **Verification**: Post-action screenshot sent back for Gemini to verify result
10. **Feedback**: TTS speaks response text, visual highlight shows action target

### Legacy Mode (Fallback)

Same flow but steps 5-6 use `generateContent` with structured JSON output `{text, actions[]}` instead of bidirectional streaming.

## Security

- **WebSocket Auth**: HMAC-SHA256 with shared secret, timestamp (60s skew), nonce replay protection
- **Extension Permissions**: `activeTab`, `sidePanel`, `tabs`, `scripting`, `storage`, `webNavigation`
- **Screenshot Data**: Compressed JPEG, sent only to own backend, not stored
- **URL Filtering**: Blocks chrome://, about:, devtools://, Chrome Web Store pages

## Accessibility (WCAG 2.1 AA)

- High contrast mode (black background, white text, yellow accents)
- Font size modes (normal 14px / large 18px / xlarge 22px)
- Keyboard shortcuts: Space (push-to-talk), Escape (cancel), Alt+V (toggle), Alt+D (describe)
- Reduced motion support via `prefers-reduced-motion`
- Bilingual support: Chinese, English, Auto-detect

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Extension | Chrome MV3, TypeScript, esbuild |
| Backend | Node.js 18, TypeScript, WebSocket (ws) |
| AI Model | Gemini Live API (gemini-live-2.5-flash-preview) |
| AI SDK | @google/genai (TypeScript) |
| Deployment | Google Cloud Run, Docker |
| Voice I/O | Web Speech API (STT + TTS) |
| Auth | HMAC-SHA256 |
