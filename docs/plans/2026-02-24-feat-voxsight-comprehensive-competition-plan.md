---
title: "VoxSight: Comprehensive Competition Sprint Plan"
type: feat
date: 2026-02-24
---

# VoxSight: Comprehensive Competition Sprint Plan

Deadline: 2026-03-17 08:00 GMT+8 (21 days remaining)
Track: UI Navigators ($10K best-of-track + $25K grand prize eligible)
Participants: 3052

## Judging Criteria Analysis

| Category | Weight | Current Status | Gap |
|----------|--------|---------------|-----|
| Innovation & Multimodal UX | 40% | Turn-based generateContent | Judges explicitly ask: "Is the experience 'Live'?" |
| Technical Implementation | 30% | WebSocket + Gemini 2.5 Flash | Need Cloud Run deploy, error handling, grounding |
| Demo & Presentation | 30% | None prepared | Need architecture diagram, demo video, write-up |

**Critical Gap**: 40% of scoring explicitly penalizes "disjointed and turn-based" experiences. Our current `generateContent` call is exactly that. Migration to Gemini Live API is the single highest-impact change.

## Priority Order (Impact-weighted)

1. **Task 1: Gemini Live API Migration** (40% judging weight)
2. **Task 2: Cloud Run Deployment** (30% -- required proof)
3. **Task 3: Architecture Diagram** (30% -- required submission)
4. **Task 4: Code Quality & Error Handling** (30% technical)
5. **Task 5: README for Judges** (required -- judges spin up locally)
6. **Task 6: Demo Video Script** (30% demo weight)
7. **Task 7: Devpost Submission Materials** (required)
8. **Task 8: Blog Post** (bonus points)

---

## Task 1: Gemini Live API Migration

**Goal**: Replace turn-based `generateContent` with bidirectional streaming via `ai.live.connect()`, making the experience feel genuinely "Live".

### Current Architecture (Turn-based)

```
User speaks -> Browser STT -> text
text + screenshot -> WebSocket -> Backend
Backend -> generateContent(gemini-2.5-flash) -> JSON {text, actions[]}
JSON -> WebSocket -> Extension
Extension -> Browser TTS speaks text, executes actions
```

### Target Architecture (Live Streaming)

```
User speaks -> mic audio stream -> WebSocket -> Backend
Backend -> ai.live.connect(gemini-live-2.5-flash-preview) -> bidirectional session
Backend sends screenshot via sendRealtimeInput({media: {data, mimeType}})
Backend sends text commands via sendClientContent({turns, turnComplete})
Gemini responds with text parts containing structured JSON actions
Backend streams responses -> WebSocket -> Extension
Extension executes actions, sends tool responses back
```

### Implementation Steps

#### 1a. Backend: Create `live-agent.ts`

New file alongside existing `agent.ts` (keep old as fallback).

```typescript
// backend/live-agent.ts
import { GoogleGenAI, Modality, Session, LiveServerMessage } from '@google/genai';

// Key changes:
// - Use ai.live.connect() instead of ai.models.generateContent()
// - Model: 'gemini-live-2.5-flash-preview' (text modality for JSON output)
// - System instruction same as current SYSTEM_INSTRUCTION
// - Function declarations for actions (click, type_text, scroll, navigate, hover, press_key)
// - Session persists per WebSocket connection (no manual conversation history)
```

Config for `ai.live.connect()`:

```typescript
const session = await ai.live.connect({
  model: 'gemini-live-2.5-flash-preview',
  config: {
    systemInstruction: SYSTEM_INSTRUCTION,
    responseModalities: [Modality.TEXT],  // TEXT for JSON actions, not AUDIO
    tools: [{
      functionDeclarations: [
        clickDeclaration,
        typeTextDeclaration,
        scrollDeclaration,
        navigateDeclaration,
        hoverDeclaration,
        pressKeyDeclaration,
      ]
    }],
  },
  callbacks: {
    onopen: () => { /* notify client */ },
    onmessage: (msg: LiveServerMessage) => { /* forward to WS client */ },
    onerror: (err) => { /* handle */ },
    onclose: (evt) => { /* cleanup */ },
  },
});
```

Function declarations approach: Instead of asking Gemini to return raw JSON with coordinates, declare functions that Gemini can "call". This gives us:
- Structured, typed responses (no JSON parsing needed)
- Grounding through tool use (judges look for this)
- Cleaner error handling per action

Example function declaration:

```typescript
const clickDeclaration = {
  name: 'click_element',
  description: 'Click on an element at the given screenshot coordinates',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      x: { type: 'number', description: 'X coordinate in screenshot pixel space' },
      y: { type: 'number', description: 'Y coordinate in screenshot pixel space' },
      description: { type: 'string', description: 'What element is being clicked' },
    },
    required: ['x', 'y', 'description'],
  },
};
```

#### 1b. Backend: Update `server.ts` session management

- Each WebSocket connection creates a Gemini Live session
- Store `Session` object in `ClientSession` (replaces `conversationHistory[]`)
- On `user_command`: send screenshot via `session.sendRealtimeInput()` + text via `session.sendClientContent()`
- On `action_result`: send result via `session.sendToolResponse()`
- On disconnect: call `session.close()`

#### 1c. Extension: Update Side Panel for streaming responses

- Handle partial/streaming text responses (display as they arrive)
- Handle function call messages (execute action, send result back)
- Remove manual conversation history management (server handles it)

#### 1d. Fallback: Keep `agent.ts` as fallback

- Add `USE_LIVE_API` env variable
- If Live API fails or is unavailable, fall back to `generateContent`
- This ensures demo works even if Live API has issues

**Files:** `backend/live-agent.ts` (new), `backend/server.ts`, `extension/src/sidepanel/main.ts`, `extension/src/shared/types.ts`

### Acceptance Criteria

- [ ] Live session established on WebSocket connect
- [ ] Screenshot sent as realtime input, text as client content
- [ ] Gemini responds with function calls for actions
- [ ] Extension executes actions and sends tool responses
- [ ] Conversation context maintained across turns (server-side)
- [ ] Fallback to generateContent if Live API unavailable

---

## Task 2: Cloud Run Deployment

Blocked on billing credits. Execute immediately when unblocked.

- [ ] Run `./deploy.sh`
- [ ] Get Cloud Run URL, update `extension/src/shared/constants.ts` `BACKEND_URL_PROD`
- [ ] Set `WS_SHARED_SECRET` as Cloud Run env var (not hardcoded dev secret)
- [ ] Rebuild extension: `npm --prefix extension run build`
- [ ] Verify extension connects to Cloud Run backend
- [ ] Record screen showing Cloud Run console + working extension (proof of deployment)

**Files:** `extension/src/shared/constants.ts`, `deploy.sh`

---

## Task 3: Architecture Diagram (Required Submission)

Create a Mermaid diagram saved as `docs/architecture.md` and render as PNG for Devpost.

```mermaid
graph TB
    subgraph Chrome Extension [Chrome Extension - Manifest V3]
        SP[Side Panel<br/>Voice I/O + UI]
        BG[Background SW<br/>Screenshot Capture]
        CS[Content Script<br/>Action Executor]
    end

    subgraph Google Cloud [Google Cloud Run]
        WS[WebSocket Server<br/>Session Manager]
        LA[Live Agent<br/>Gemini Live API Client]
    end

    subgraph Google AI [Gemini API]
        GM[gemini-live-2.5-flash<br/>Multimodal Vision + Tool Use]
    end

    User -->|Voice Command| SP
    SP -->|captureScreenshot| BG
    BG -->|captureVisibleTab| Browser
    SP <-->|WebSocket + HMAC Auth| WS
    WS <-->|ai.live.connect()| LA
    LA <-->|Bidirectional Stream| GM
    SP -->|executeAction| CS
    CS -->|DOM Manipulation| Browser
    SP -->|TTS Feedback| User
```

Include:
- Data flow annotations (screenshot JPEG, PCM audio, JSON actions)
- Security layer (HMAC auth)
- Accessibility features (high contrast, font size, keyboard shortcuts)

**Files:** `docs/architecture.md` (new)

---

## Task 4: Code Quality & Error Handling

### 4a. Coordinate Validation in `sanitizeActions`

In `backend/agent.ts` (or `live-agent.ts` for function call responses):

- click/type_text/hover: x >= 0, y >= 0, x <= screenshot width, y <= screenshot height
- scroll amount: > 0 and <= 5000
- navigate url: must start with `http://` or `https://`
- Invalid actions: remove from array, append warning to text

### 4b. Side Panel Error Handling

- Network offline: disable voice button, show offline indicator
- `about:blank` detection: prompt user to open a webpage
- Content script not injected: detect and prompt page refresh

### 4c. Backend Resilience

- Gemini API timeout: 15s timeout with one automatic retry
- Live session disconnect: auto-reconnect with session resumption
- Rate limiting: basic request throttle per session

### 4d. elementFromPoint null handling

In `extension/src/content/index.ts`:
- When `elementFromPoint` returns null, search nearby coordinates (+-10px grid)
- Return suggestion: "No element at exact position, nearest clickable element is..."

**Files:** `backend/agent.ts`, `backend/live-agent.ts`, `extension/src/sidepanel/main.ts`, `extension/src/content/index.ts`

---

## Task 5: README for Judges

Judges need to spin up locally. Create comprehensive `README.md` at project root.

Structure:
- Project name + one-line description
- Architecture diagram (embed from docs/)
- Prerequisites (Node.js 18+, Chrome 120+, Gemini API key)
- Quick Start (3 steps: clone, set API key, run)
- Loading the Extension (screenshots if possible)
- Cloud Run Deployment (one-command `deploy.sh`)
- Tech Stack table
- Accessibility features list
- Project structure overview

**Files:** `README.md` (new)

---

## Task 6: Demo Video Script (< 4 minutes)

**Files:** `docs/demo-script.md` (new)

### Opening (30s)
- VoxSight logo + tagline: "Voice-driven visual web navigator"
- Problem statement: 285M visually impaired users, web still primarily visual
- "Powered by Gemini Live API on Google Cloud"

### Scene 1: Page Description (45s)
- Open Google.com
- Voice: "Describe this page"
- Show Gemini analyzing screenshot, describing elements
- Highlight real-time streaming response

### Scene 2: Voice Navigation (60s)
- Voice: "Search for accessible web design guidelines"
- Show Gemini identifying search box, typing, pressing Enter
- Voice: "Click the first result"
- Show action confirmation + execution + highlight overlay

### Scene 3: Form Filling (45s)
- Open a form page
- Voice: "Fill in the name field with John Smith"
- Voice: "Select the second option from the dropdown"
- Show multi-step action flow with verification

### Architecture & Tech (30s)
- Show architecture diagram
- Highlight: Gemini Live API, Cloud Run, Chrome Extension MV3
- Mention: HMAC auth, screenshot compression, WCAG 2.1 AA

### Closing (30s)
- Accessibility impact statement
- Future vision: multi-tab, auto-form-fill, screen reader integration
- "Built for the Gemini Live Agent Challenge"

---

## Task 7: Devpost Submission Materials

**Files:** `docs/devpost-submission.md` (new)

Required fields:
- [ ] Project name: VoxSight
- [ ] Short description (300 chars)
- [ ] Full description (What it does, How we built it, Challenges, What we learned, What's next)
- [ ] Tech stack: Gemini Live API, @google/genai SDK, Cloud Run, Chrome Extension MV3, TypeScript, WebSocket
- [ ] GitHub repo link (public)
- [ ] Demo video link
- [ ] Architecture diagram image
- [ ] Proof of GCP deployment (screenshot/recording)

---

## Task 8: Blog Post (Bonus Points)

**Files:** `docs/blog-draft.md` (new)

Title: "Building VoxSight: How Gemini's Live API Makes the Web Accessible for Everyone"
Hashtag: #GeminiLiveAgentChallenge (required for bonus)

Structure (~1500 words):
1. The Problem: Web accessibility gap
2. The Solution: Voice + Vision AI
3. Architecture Deep Dive: Why Live API over turn-based
4. Technical Challenges: Coordinate mapping, screenshot compression, MV3 constraints
5. Demo Walkthrough
6. Impact & Future

---

## Execution Order

### Week 1 (Feb 24-28): Core Technical

1. Task 1 (Live API Migration) -- highest impact, most complex
2. Task 4 (Code Quality) -- can be done in parallel

### Week 2 (Mar 1-7): Deployment + Materials

3. Task 2 (Cloud Run) -- execute when billing clears
4. Task 3 (Architecture Diagram)
5. Task 5 (README)

### Week 3 (Mar 8-16): Demo + Submission

6. Task 6 (Demo Video Script + Record)
7. Task 7 (Devpost Materials)
8. Task 8 (Blog Post)

### March 17: Submit

---

## Risk Analysis

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Billing credits never arrive | Cannot deploy to Cloud Run (required) | Follow up on Discord; try free tier or alternative GCP project |
| Live API migration fails | Lose 40% judging advantage | Keep generateContent fallback; optimize UX to feel less turn-based |
| Live API model doesn't support vision well | Cannot analyze screenshots in live session | Use sendRealtimeInput for images; verify with test |
| Demo video quality poor | 30% judging weight | Write detailed script; practice before recording |

## Acceptance Criteria (Competition-Ready)

- [ ] Gemini Live API bidirectional streaming works end-to-end
- [ ] OR: generateContent fallback with optimized UX feels responsive
- [ ] Cloud Run deployment successful with proof recording
- [ ] Architecture diagram clear and accurate
- [ ] README enables judges to spin up in < 5 minutes
- [ ] Demo video < 4 minutes, covers all 3 scenarios
- [ ] Devpost submission materials complete
- [ ] Blog post published with #GeminiLiveAgentChallenge
- [ ] All error edge cases handled gracefully
- [ ] WCAG 2.1 AA accessibility features working
