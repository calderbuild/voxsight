---
title: "VoxSight: Final Sprint - Deploy, Test, Submit"
type: feat
date: 2026-03-13
---

# VoxSight: Final Sprint - Deploy, Test, Submit

**Deadline**: 2026-03-16 23:59 Pacific Time (2026-03-17 15:59 GMT+8) -- **3 days remaining**
**Track**: UI Navigators ($10K best-of-track + $25K grand prize eligible)

## Current Status

| Component | Status | Notes |
|-----------|--------|-------|
| Live API bidirectional streaming | Done | `backend/live-agent.ts`, 6 function declarations |
| Legacy fallback (generateContent) | Done | `backend/agent.ts`, auto-fallback when proxy detected |
| WebSocket server + HMAC auth | Done | `backend/server.ts`, `backend/auth.ts` |
| Chrome Extension (Side Panel + Content Script) | Done | Tool call handling, screenshot capture, action execution |
| Coordinate validation + error handling | Done | sanitizeActions, findNearbyElement, offline detection |
| Accessibility (HC, font size, i18n) | Done | WCAG 2.1 AA |
| Architecture diagram | Done | `docs/architecture.md` |
| README for judges | Done | Project root |
| Demo video script | Done | `docs/demo-script.md` |
| Devpost submission text | Done | `docs/devpost-submission.md` |
| Blog post draft | Done | `docs/blog-draft.md` |
| Privacy policy | Done | `store/privacy-policy.md` |
| Deploy script | Done | `deploy.sh` |
| Dockerfile | Done | `backend/Dockerfile` |
| **Cloud Run deployment** | **NOT DONE** | Billing now available |
| **BACKEND_URL_PROD** | **Empty** | `extension/src/shared/constants.ts` line 2 |
| **End-to-end test with Live API** | **NOT DONE** | Never tested in production (only legacy mode locally) |
| **Demo video recorded** | **NOT DONE** | Script ready, video not recorded |
| **Devpost submitted** | **NOT DONE** | Text ready, links missing |
| **Blog published** | **NOT DONE** | Draft ready, not published |

## Key Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Live API doesn't work well with screenshots on Cloud Run | Lose 40% judging advantage | Test immediately after deploy; keep legacy fallback |
| Cloud Run WebSocket timeout kills session | Demo fails mid-session | 300s timeout set in deploy.sh; keep interactions under 5 min |
| `sendRealtimeInput` for images not reliable | Actions fail silently | Test with multiple page types; fall back to legacy if needed |
| WS_SHARED_SECRET hardcoded in extension | Auth works but insecure | Acceptable for hackathon; both sides use same default value |
| Cloud Run cold start slow (~5s) | First request feels sluggish | min-instances=0 means cold start; can set to 1 but costs money |

## Judging Criteria Alignment

| Category | Weight | Our Strength |
|----------|--------|-------------|
| Innovation & Multimodal UX | 40% | Live API bidi streaming, voice + vision, accessibility focus |
| Technical Implementation | 30% | Cloud Run, HMAC auth, coordinate validation, MV3, function calling |
| Demo & Presentation | 30% | Script ready, 3 scenarios, architecture diagram |

**Bonus points**: Blog post (+0.6), Infrastructure-as-Code (+0.2, deploy.sh qualifies)

---

## Phase 1: Deploy to Cloud Run (Day 1 -- March 13)

### Task 1.1: Deploy backend

```bash
./deploy.sh
```

**Acceptance**: `gcloud run services describe voxsight-backend --region us-central1` returns running service with HTTPS URL.

**Files**: `deploy.sh`

### Task 1.2: Update extension with production URL

Get Cloud Run URL from deploy output, update `BACKEND_URL_PROD`:

**File**: `extension/src/shared/constants.ts`

```typescript
const BACKEND_URL_PROD = 'wss://voxsight-backend-XXXXX-uc.a.run.app';
```

Then rebuild: `cd extension && npm run build`

### Task 1.3: Set WS_SHARED_SECRET on Cloud Run

Current state: both extension and backend use hardcoded `'voxsight-dev-shared-secret'`. Deploy script doesn't set `WS_SHARED_SECRET` env var. Backend falls back to the same default, so auth works -- but should be explicit.

```bash
gcloud run services update voxsight-backend \
  --region us-central1 \
  --set-env-vars "WS_SHARED_SECRET=voxsight-dev-shared-secret"
```

Or skip this -- the default fallback already matches. Acceptable for hackathon.

### Task 1.4: Verify health check

```bash
curl https://voxsight-backend-XXXXX-uc.a.run.app/health
```

**Acceptance**: Returns 200 OK.

---

## Phase 2: End-to-End Testing (Day 1-2)

### Task 2.1: Load extension and test basic connectivity

1. Load `extension/dist/` in chrome://extensions/
2. Open a webpage (e.g., google.com)
3. Open Side Panel
4. Check WebSocket connects (Live Summary shows "Connected")
5. Check console for `[LiveAgent] Session opened`

### Task 2.2: Test Live API voice commands

Test these scenarios (same as demo script):

1. "Describe this page" -- should return text description of screenshot
2. "Click on the search box" -- should trigger `click_element` tool call with coordinates
3. "Type hello world" -- should trigger `type_text` tool call
4. "Scroll down" -- should trigger `scroll_page` tool call

**Critical test**: Does Gemini correctly analyze the screenshot and return valid coordinates?

### Task 2.3: Test error cases

1. Navigate to chrome://settings -- should show "cannot capture this page"
2. Disconnect network -- should show offline indicator
3. Close and reopen Side Panel -- should reconnect
4. Send command on about:blank -- should prompt to open a webpage

### Task 2.4: Fix any issues found

Likely issues to watch for:
- Live API session creation fails -> check API key env var on Cloud Run
- Coordinates completely wrong -> check screenshot resolution/compression
- Tool calls not forwarded to extension -> check server.ts message routing
- Actions execute but nothing happens -> check devicePixelRatio conversion

If Live API is fundamentally broken, set `USE_LIVE_API=false` on Cloud Run and use legacy mode. Better to have a working demo than a broken "live" one.

---

## Phase 3: Demo Video (Day 2 -- March 14-15)

### Task 3.1: Record demo video

Follow `docs/demo-script.md`. Key points:
- **Max 4 minutes** (only first 4 min evaluated)
- Must show **real working features** (no mockups)
- Must demonstrate multimodal/agentic features
- Include problem pitch and solution value

Recording setup:
- Screen recording with audio (OBS or macOS built-in)
- Chrome window with Side Panel visible
- Microphone for voice commands
- Clean desktop, close unnecessary tabs

### Task 3.2: Upload to YouTube

- Upload as **public** (not unlisted -- Devpost requires public)
- Title: "VoxSight - Voice-Driven Visual Web Navigator | Gemini Live Agent Challenge"
- Description: brief project summary + GitHub link

### Task 3.3: Take GCP deployment proof screenshot

- Screenshot of Cloud Run console showing running service
- Or `gcloud run services describe` output
- Save for Devpost submission

---

## Phase 4: Submit (Day 2-3 -- March 15-16)

### Task 4.1: Publish blog post

Publish `docs/blog-draft.md` to dev.to or Medium.
- Must be **publicly visible**
- Must state it was created for this hackathon
- Hashtag: #GeminiLiveAgentChallenge
- **Bonus**: +0.6 points

### Task 4.2: Make GitHub repo public

The repo must be public for Devpost submission and judge review.

```bash
gh repo edit --visibility public
```

### Task 4.3: Submit on Devpost

Fill in all fields using `docs/devpost-submission.md`:

Required:
- [ ] Project name: VoxSight
- [ ] Short description (300 chars)
- [ ] Full description (What it does, How built, Challenges, Learned, Next)
- [ ] Tech stack: Gemini Live API, @google/genai SDK, Cloud Run, Chrome MV3, TypeScript, WebSocket
- [ ] GitHub repo link (public)
- [ ] Demo video link (YouTube, public)
- [ ] Architecture diagram image (render from docs/architecture.md)
- [ ] Proof of GCP deployment (screenshot)
- [ ] Blog post URL (for bonus points)

### Task 4.4: Architecture diagram as image

Render `docs/architecture.md` mermaid diagram to PNG. Options:
- https://mermaid.live/ -- paste mermaid code, export PNG
- Or screenshot from GitHub markdown preview (GitHub renders mermaid)

---

## Optimization Opportunities (If Time Permits)

Listed by impact-to-effort ratio:

### Opt-1: Streaming text display (High impact, Low effort)

Currently `main.ts` accumulates text from `tool_call` message type but may not show streaming partial text from Live API in real-time. Verify that `text` messages from Live API are displayed incrementally in the Side Panel as they arrive (word by word), not buffered until `turn_complete`.

This is the most visible "live" feel improvement for the 40% judging criteria.

**File**: `extension/src/sidepanel/main.ts` -- check `handleServerMessage` for `agent_response` type handling.

### Opt-2: Auto-screenshot verification loop (Medium impact, Low effort)

After executing an action, automatically take a screenshot and send it to Gemini with "Describe what changed after the action" to create a continuous awareness loop. Already partially implemented in `handleToolCall` (sends post-action screenshot).

Verify this works end-to-end in production.

### Opt-3: Better system instruction for demo scenarios (Medium impact, Low effort)

Tune `SYSTEM_INSTRUCTION` in `live-agent.ts` to produce more impressive responses during demo:
- More descriptive page analysis
- Better element identification
- More natural conversational tone

### Opt-4: Cold start optimization (Low impact, Medium effort)

Set `--min-instances 1` to avoid cold start delay during demo:

```bash
gcloud run services update voxsight-backend --region us-central1 --min-instances 1
```

Cost: ~$5/month. Worth it for a smooth demo.

---

## Timeline

| Date | Tasks | Deliverable |
|------|-------|-------------|
| Mar 13 (Today) | Phase 1: Deploy + Phase 2: Test | Working production deployment |
| Mar 14 | Phase 2: Fix issues + Phase 3: Record video | Demo video uploaded |
| Mar 15 | Phase 3: Upload + Phase 4: Blog + Devpost | Blog published, Devpost draft |
| Mar 16 | Phase 4: Final submission + review | Devpost submitted before 23:59 PT |

## Acceptance Criteria (Competition-Ready)

- [ ] Cloud Run deployment live and accessible
- [ ] Extension connects to Cloud Run backend via WebSocket
- [ ] Live API streaming works end-to-end (or legacy fallback confirmed working)
- [ ] Demo video < 4 minutes uploaded to YouTube (public)
- [ ] Devpost submission complete with all required fields
- [ ] Blog post published (bonus +0.6)
- [ ] GitHub repo public
- [ ] Architecture diagram rendered as image for Devpost
