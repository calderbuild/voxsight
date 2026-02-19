import { readFileSync } from 'fs';
import { WebSocket } from 'ws';

const BACKEND_URL = 'ws://localhost:8080';
const SCREENSHOT_PATH = process.argv[2] || '../test-screenshot.jpg';

// Read screenshot and convert to data URL
const imageBuffer = readFileSync(SCREENSHOT_PATH);
const base64Image = imageBuffer.toString('base64');
const dataUrl = `data:image/jpeg;base64,${base64Image}`;

console.log(`Screenshot loaded: ${(imageBuffer.length / 1024).toFixed(1)} KB`);
console.log('Connecting to backend...');

const ws = new WebSocket(BACKEND_URL);

ws.on('open', () => {
  console.log('WebSocket connected');
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log(`\nReceived [${msg.type}]:`);

  if (msg.type === 'connected') {
    console.log(`Session ID: ${msg.sessionId}`);
    console.log('\nSending user command: "Describe this page"...');

    ws.send(JSON.stringify({
      type: 'user_command',
      text: 'Describe this page',
      screenshot: {
        type: 'screenshot',
        image: dataUrl,
        devicePixelRatio: 2,
        viewportWidth: 1280,
        viewportHeight: 800,
        url: 'https://www.google.com',
        title: 'Google',
      },
    }));
  }

  if (msg.type === 'agent_response') {
    console.log(`Text: ${msg.text}`);
    console.log(`Actions: ${JSON.stringify(msg.actions, null, 2)}`);
    console.log('\nE2E test PASSED');
    ws.close();
    process.exit(0);
  }

  if (msg.type === 'error') {
    console.error(`Error: ${msg.message}`);
    ws.close();
    process.exit(1);
  }
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message);
  process.exit(1);
});

// Timeout after 30s
setTimeout(() => {
  console.error('Timeout: no response in 30s');
  ws.close();
  process.exit(1);
}, 30000);
