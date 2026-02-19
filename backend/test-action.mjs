import { readFileSync } from 'fs';
import { createHmac, randomBytes } from 'crypto';
import { WebSocket } from 'ws';

const BACKEND_URL = process.env.BACKEND_URL || 'ws://localhost:8080';
const SCREENSHOT_PATH = process.argv[2] || '../test-screenshot.jpg';
const COMMAND = process.argv[3] || 'Click on the Gmail link';
const WS_SHARED_SECRET = process.env.WS_SHARED_SECRET || 'voxsight-dev-shared-secret';

function createAuthenticatedWebSocketUrl(baseUrl) {
  const ts = Date.now().toString();
  const nonce = randomBytes(12).toString('hex');
  const sig = createHmac('sha256', WS_SHARED_SECRET).update(`${ts}.${nonce}`).digest('hex');
  const url = new URL(baseUrl);
  url.searchParams.set('ts', ts);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('sig', sig);
  return url.toString();
}

const imageBuffer = readFileSync(SCREENSHOT_PATH);
const base64Image = imageBuffer.toString('base64');
const dataUrl = `data:image/jpeg;base64,${base64Image}`;

console.log(`Command: "${COMMAND}"`);

const ws = new WebSocket(createAuthenticatedWebSocketUrl(BACKEND_URL));

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.type === 'connected') {
    ws.send(JSON.stringify({
      type: 'user_command',
      text: COMMAND,
      screenshot: {
        type: 'screenshot', image: dataUrl,
        devicePixelRatio: 2, viewportWidth: 1280,
        viewportHeight: 800, url: 'https://www.google.com', title: 'Google',
      },
    }));
  }
  if (msg.type === 'agent_response') {
    console.log(`\nResponse: ${msg.text}`);
    console.log(`Actions: ${JSON.stringify(msg.actions, null, 2)}`);
    ws.close();
    process.exit(0);
  }
  if (msg.type === 'error') {
    console.error(`Error: ${msg.message}`);
    ws.close();
    process.exit(1);
  }
});

setTimeout(() => { process.exit(1); }, 30000);
