# VoxSight

Voice-driven visual web navigator powered by Gemini Live API. Helps visually impaired users and anyone who needs hands-free web browsing.

Built for the [Gemini Live Agent Challenge](https://geminiliveagentchallenge.devpost.com/) (UI Navigators track).

## How It Works

1. You speak a command ("Click the search button", "Fill in my name", "Describe this page")
2. VoxSight captures a screenshot and sends it to Gemini's multimodal vision model
3. Gemini analyzes the screenshot, identifies elements, and returns precise actions
4. The extension executes actions on the page and speaks the result back to you

## Architecture

See [docs/architecture.md](docs/architecture.md) for the full system diagram.

```
Chrome Extension (Side Panel + Background SW + Content Script)
    |
    | WebSocket + HMAC Auth
    v
Cloud Run Backend (Session Manager + Live Agent)
    |
    | ai.live.connect() bidirectional streaming
    v
Gemini Live API (gemini-live-2.5-flash-preview)
```

## Prerequisites

- Node.js 18+
- Chrome 120+
- Gemini API key ([get one here](https://aistudio.google.com/app/apikey))

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/calderbuild/voxsight.git
cd voxsight
npm --prefix backend install
npm --prefix extension install
```

### 2. Configure and start backend

```bash
cd backend
cp .env.example .env
# Edit .env: set GEMINI_API_KEY=your_key_here
npx tsx server.ts
```

### 3. Build and load extension

```bash
cd extension
npm run build
```

Then in Chrome:
1. Go to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `extension/dist/` directory
5. Click the VoxSight icon or press `Alt+V` to open the side panel

## Usage

- **Voice**: Hold the microphone button (or press Space) and speak a command
- **Text**: Type in the text input field and press Enter
- **Quick Actions**: "Describe this page" button, "Read content" button
- **Keyboard Shortcuts**:
  - `Alt+V` - Toggle VoxSight side panel
  - `Alt+D` - Describe current page
  - `Space` - Push-to-talk (when side panel focused)
  - `Escape` - Cancel current operation

## Cloud Run Deployment

```bash
# Set your GCP project and Gemini API key
export GCP_PROJECT_ID=your-project-id
export GEMINI_API_KEY=your-key

# One-command deploy
./deploy.sh
```

The script enables required APIs, deploys to Cloud Run, and outputs the WebSocket URL. Update `extension/src/shared/constants.ts` with the URL, rebuild the extension, and reload.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Extension | Chrome Manifest V3, TypeScript, esbuild |
| Backend | Node.js 18, TypeScript, WebSocket (ws) |
| AI | Gemini Live API (`gemini-live-2.5-flash-preview`) |
| SDK | `@google/genai` (TypeScript) |
| Deployment | Google Cloud Run, Docker |
| Voice I/O | Web Speech API (STT + TTS) |
| Auth | HMAC-SHA256 (timestamp + nonce + signature) |

## Accessibility Features

- High contrast mode (WCAG 2.1 AA)
- Adjustable font sizes (normal / large / extra-large)
- Keyboard navigation for all controls
- Reduced motion support
- Bilingual: Chinese, English, Auto-detect
- Visual highlight overlay on action targets

## Project Structure

```
voxsight/
  extension/
    src/
      sidepanel/    - Side Panel UI, voice I/O, WebSocket client
      background/   - Service Worker: screenshot capture, shortcuts
      content/      - Action executor: click/type/scroll/hover
      shared/       - Types, constants, auth, coordinates
    manifest.json
    build.mjs
  backend/
    server.ts       - WebSocket server, session management
    live-agent.ts   - Gemini Live API bidirectional streaming
    agent.ts        - Legacy generateContent fallback
    auth.ts         - HMAC WebSocket authentication
    Dockerfile
  deploy.sh         - One-command Cloud Run deployment
  docs/
    architecture.md - System architecture diagram
```

## License

MIT
