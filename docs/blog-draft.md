# Building VoxSight: How Gemini's Live API Makes the Web Accessible for Everyone

#GeminiLiveAgentChallenge

---

## The Problem Nobody Talks About

There are 285 million visually impaired people worldwide. Every one of them faces the same challenge: the web was built for eyes.

Screen readers have existed for decades, but they work by parsing the DOM -- a fragile approach that breaks on dynamic single-page apps, canvas-rendered content, and sites with poor semantic markup. When a screen reader encounters a `<div onclick="...">` instead of a `<button>`, it's invisible.

What if instead of trying to parse the code behind a webpage, we could just _look_ at it?

## The Idea: Vision + Voice

VoxSight takes a fundamentally different approach. Instead of reading the DOM, it reads the _screen_ -- exactly what a sighted user would see.

The flow is simple:
1. User speaks a command
2. VoxSight captures a screenshot
3. Gemini's multimodal vision analyzes the image
4. The model returns precise actions (click here, type this, scroll there)
5. VoxSight executes the actions on the page

This works on every website. No semantic markup required. No ARIA labels needed. If a human can see it, Gemini can see it.

## Why the Live API Changes Everything

Our first prototype used Gemini's standard `generateContent` API. It worked, but the experience felt clunky. You'd speak a command, wait 2-3 seconds for the response, hear the TTS output, and then wait again while the action executed. Every interaction was a discrete round-trip.

The Gemini Live API (`ai.live.connect()`) transforms this from a request-response pattern into a continuous conversation. The WebSocket stays open. Context accumulates. Gemini remembers what happened three commands ago.

More importantly, it uses function calling natively. Instead of asking Gemini to output structured JSON (which sometimes results in malformed output), we declare function schemas for each action type:

```typescript
const clickDeclaration = {
  name: 'click_element',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      x: { type: 'number' },
      y: { type: 'number' },
      description: { type: 'string' },
    },
    required: ['x', 'y', 'description'],
  },
};
```

Gemini calls these functions directly. No JSON parsing. No validation of malformed output. The tool use interface is the contract.

## The Architecture

VoxSight is a Chrome Extension (Manifest V3) connected to a Cloud Run backend.

The extension has three components:
- **Side Panel**: Persistent UI with voice I/O, WebSocket client, and accessibility controls
- **Background Service Worker**: Captures screenshots via `captureVisibleTab`
- **Content Script**: Executes DOM actions (click, type, scroll) with coordinate translation

The backend runs on Cloud Run and maintains a Gemini Live session per connected client. When a user speaks a command, the flow is:

1. Side Panel captures screenshot + transcribes speech
2. Screenshot goes to backend via WebSocket (HMAC authenticated)
3. Backend sends screenshot to Gemini via `sendRealtimeInput()` and text via `sendClientContent()`
4. Gemini responds with function calls (e.g., `click_element(x=542, y=318, description="Search button")`)
5. Backend forwards the tool call to the extension
6. Content Script translates coordinates and executes the click
7. Result goes back to Gemini for verification

The entire round-trip feels responsive because the Live session maintains context and Gemini can start responding before the full input is processed.

## Technical Challenges

### The Coordinate Problem

Gemini works in screenshot pixel space. A MacBook with a Retina display captures at 2x resolution, so a viewport that's 1280px wide produces a 2560px screenshot. When Gemini says "click at (542, 318)", that's in the 2560px space.

The Content Script needs CSS pixels. The translation is simple: `cssPoint = imgPoint / devicePixelRatio`. But getting the DPR right requires injecting a script into the target tab:

```javascript
const [result] = await chrome.scripting.executeScript({
  target: { tabId: targetTabId },
  func: () => ({ devicePixelRatio: window.devicePixelRatio }),
});
```

### MV3 Service Worker Constraints

Manifest V3 replaced persistent background pages with Service Workers that get killed after 30 seconds of idle. You cannot maintain a WebSocket connection in a Service Worker.

Our solution: the WebSocket lives in the Side Panel, which has a persistent DOM as long as it's open. The Service Worker only handles screenshot capture and keyboard shortcuts -- operations that complete quickly.

### Screenshot Capture Gotchas

`captureVisibleTab` captures whatever is currently visible in a Chrome window. If the user has a `chrome://settings` tab active, the capture fails. If they switch tabs while VoxSight is processing, we capture the wrong page.

We added multiple safeguards:
- URL filtering: reject chrome://, about:, devtools:// URLs
- Tab activation: programmatically switch to the target web tab before capture
- Post-action verification: capture again after executing an action to confirm it worked

### When `elementFromPoint` Returns Null

Sometimes Gemini's coordinates land in the gap between elements -- padding, margins, or the space between buttons. The browser's `elementFromPoint` returns null or the root document.

We implemented a nearby element search that checks surrounding coordinates in a spiral pattern:

```javascript
const offsets = [0, -5, 5, -10, 10];
for (const dx of offsets) {
  for (const dy of offsets) {
    const el = document.elementFromPoint(x + dx, y + dy);
    if (el && el !== document.body) return el;
  }
}
```

## Accessibility Is Not an Afterthought

VoxSight itself needs to be accessible. The Side Panel supports:
- **High contrast mode**: Black background, white text, yellow accents (WCAG 2.1 AA)
- **Font scaling**: Three sizes (14px, 18px, 22px) for low-vision users
- **Keyboard navigation**: Space for push-to-talk, Escape to cancel, Alt+V to toggle
- **Reduced motion**: Respects `prefers-reduced-motion` media query
- **Bilingual**: Chinese and English with automatic language detection

## What's Next

VoxSight is a starting point. The screenshot-based approach has clear advantages over DOM parsing, but it also has limitations: it can't interact with elements hidden behind overlays, and it processes one frame at a time.

Future directions:
- **Native audio streaming**: Replace browser TTS with Gemini's audio modality for more natural voice
- **Multi-tab management**: Voice commands to switch tabs and manage workflows
- **Screen reader integration**: Complement existing assistive technology instead of replacing it
- **Mobile Chrome**: The architecture translates directly to Android

The web doesn't have to be visual-only. With multimodal AI, we can build interfaces that work for everyone.

---

_VoxSight is built with Gemini Live API, @google/genai SDK, and Google Cloud Run. Try it at [github.com/calderbuild/voxsight](https://github.com/calderbuild/voxsight)._
