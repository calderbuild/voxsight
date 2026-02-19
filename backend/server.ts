import 'dotenv/config';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
if (proxyUrl) {
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
  console.log(`Using proxy: ${proxyUrl}`);
}

import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { handleUserCommand } from './agent.js';
import { verifyWebSocketAuth } from './auth.js';

const PORT = parseInt(process.env.PORT || '8080', 10);

const httpServer = createServer((_req, res) => {
  // Health check endpoint for Cloud Run
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', service: 'voxsight-backend' }));
});

const wss = new WebSocketServer({ server: httpServer });

interface ClientSession {
  id: string;
  ws: WebSocket;
}

const sessions = new Map<string, ClientSession>();

wss.on('connection', (ws: WebSocket, req) => {
  const auth = verifyWebSocketAuth(req.url);
  if (!auth.ok) {
    console.warn('Rejected unauthenticated WebSocket connection:', auth.reason);
    ws.close(1008, 'Unauthorized');
    return;
  }

  const sessionId = randomUUID();
  const session: ClientSession = { id: sessionId, ws };
  sessions.set(sessionId, session);

  console.log(`Client connected: ${sessionId}`);

  // Send connected message
  ws.send(JSON.stringify({ type: 'connected', sessionId }));

  ws.on('message', async (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'user_command') {
        const response = await handleUserCommand(
          msg.text,
          msg.screenshot.image,
          msg.screenshot.devicePixelRatio,
          msg.screenshot.viewportWidth,
          msg.screenshot.viewportHeight,
          msg.screenshot.url,
        );

        ws.send(JSON.stringify(response));
      }
    } catch (err) {
      console.error('Message handling error:', err);
      ws.send(JSON.stringify({
        type: 'error',
        message: err instanceof Error ? err.message : 'Internal server error',
      }));
    }
  });

  ws.on('close', () => {
    console.log(`Client disconnected: ${sessionId}`);
    sessions.delete(sessionId);
  });

  ws.on('error', (err) => {
    console.error(`WebSocket error for ${sessionId}:`, err);
    sessions.delete(sessionId);
  });
});

httpServer.listen(PORT, () => {
  console.log(`VoxSight backend running on port ${PORT}`);
});
