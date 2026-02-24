# Devpost Submission: VoxSight

## Project Name

VoxSight

## Short Description (300 chars)

VoxSight is a Chrome extension that lets users browse the web using voice commands. Powered by Gemini's Live API and multimodal vision, it captures screenshots, understands page layouts, and executes precise actions -- making the web accessible for visually impaired users and hands-free browsing.

## What it does

VoxSight transforms web browsing into a voice-driven experience. Users speak natural commands like "Click the search button" or "Fill in my email address", and VoxSight:

1. Captures a screenshot of the current page
2. Sends it to Gemini's multimodal vision model for analysis
3. Receives precise actions (click coordinates, text to type, scroll directions)
4. Executes those actions directly on the page
5. Verifies the result with a follow-up screenshot

The extension runs as a Chrome Side Panel with bidirectional streaming via Gemini's Live API, creating a continuous, context-aware conversation rather than isolated turn-based interactions.

Key features:
- Voice commands in Chinese and English with auto-detection
- High-risk action confirmation (submit, pay, delete)
- Visual highlight overlay showing where actions will occur
- WCAG 2.1 AA accessibility: high contrast mode, adjustable font sizes, keyboard shortcuts
- Automatic page description on tab changes

## How we built it

**Architecture**: Chrome Extension (Manifest V3) with three components:
- **Side Panel**: Voice I/O via Web Speech API, WebSocket client, accessibility controls
- **Background Service Worker**: Screenshot capture via `captureVisibleTab`, keyboard shortcuts
- **Content Script**: DOM action execution with coordinate translation (screenshot pixels -> CSS pixels)

**Backend**: Node.js TypeScript server on Cloud Run with:
- WebSocket server with HMAC-SHA256 authentication
- Gemini Live API client (`ai.live.connect()`) for bidirectional streaming
- Function declarations for 6 action types (click, type, scroll, navigate, hover, press_key)
- Legacy `generateContent` fallback for environments where Live API isn't available

**Key technical decisions**:
- Screenshot-based analysis over DOM parsing: works on any website without needing to understand its structure
- Function calling over raw JSON: gives us typed, validated actions with grounding
- Canvas-based screenshot compression: reduces payload from ~500KB to ~80KB

## Challenges we ran into

1. **Coordinate systems**: Gemini returns coordinates in screenshot pixel space, but the Content Script needs CSS pixels. The `devicePixelRatio` varies between displays (1x, 2x Retina, 3x). We solved this with explicit coordinate translation: `cssPoint = imgPoint / devicePixelRatio`.

2. **MV3 Service Worker limitations**: The Background Service Worker has no DOM and is killed after 30s idle. We moved the WebSocket connection to the Side Panel (persistent DOM) and use the SW only for `captureVisibleTab`.

3. **Tab capture gotchas**: `captureVisibleTab` captures whatever is visible in the window. If a chrome:// tab is active, it fails. We added URL filtering (`isScriptableUrl`) and automatic tab activation before capture.

4. **Live API WebSocket proxy**: The Live API uses WebSocket which bypasses HTTP proxy configuration. We implemented automatic fallback to `generateContent` when proxy is detected.

5. **elementFromPoint null results**: When Gemini's coordinates land between elements, `elementFromPoint` returns null. We added a nearby element search that checks surrounding coordinates in a spiral pattern.

## Accomplishments that we're proud of

- Bidirectional streaming with Gemini Live API makes the experience feel truly "live" -- not turn-based
- Works on any website without needing site-specific code or DOM parsing
- Full accessibility suite: high contrast, font scaling, keyboard navigation, bilingual support
- One-command Cloud Run deployment with automated deployment script

## What we learned

- Gemini's multimodal vision is remarkably good at understanding web page layouts from screenshots
- Function calling in the Live API provides a cleaner interface than asking models to output structured JSON
- Chrome Extension MV3 has significant constraints that require careful architecture decisions
- Screenshot-based interaction is more universal than DOM-based approaches but requires careful coordinate handling

## What's next for VoxSight

- **Audio streaming**: Replace browser STT/TTS with Gemini's native audio modality for lower latency
- **Multi-tab management**: Let users switch between tabs by voice ("Go to the Gmail tab")
- **Form auto-fill**: Detect forms and offer to fill them from user profile data
- **Screen reader integration**: Complement existing screen readers rather than replace them
- **Mobile support**: Port to Chrome on Android using the same architecture

## Built With

- Gemini Live API (gemini-live-2.5-flash-preview)
- @google/genai SDK (TypeScript)
- Google Cloud Run
- Chrome Extension Manifest V3
- TypeScript
- Node.js
- WebSocket
- Web Speech API
- esbuild
- Docker

## Links

- GitHub: https://github.com/calderbuild/voxsight
- Demo Video: [TODO: add after recording]
