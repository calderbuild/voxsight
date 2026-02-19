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
import { handleAgentTurn, type ConversationTurn } from './agent.js';
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
  conversationHistory: ConversationTurn[];
  languageMode: 'zh' | 'en' | 'auto';
}

const sessions = new Map<string, ClientSession>();

function normalizeLanguageMode(value: unknown): 'zh' | 'en' | 'auto' {
  if (value === 'zh' || value === 'en' || value === 'auto') {
    return value;
  }
  return 'auto';
}

function pushConversationTurn(
  history: ConversationTurn[],
  userText: string,
  assistantText: string,
): ConversationTurn[] {
  const next = [...history, { userText, assistantText }];
  if (next.length <= 10) {
    return next;
  }
  return [next[0], ...next.slice(-8)];
}

function summarizeAction(action: unknown): string {
  if (!action || typeof action !== 'object') {
    return 'unknown action';
  }
  const typedAction = action as Record<string, unknown>;
  const type = typeof typedAction.type === 'string' ? typedAction.type : 'unknown';
  if (type === 'click') {
    const description = typeof typedAction.description === 'string' ? typedAction.description : 'target';
    return `click (${description})`;
  }
  if (type === 'type_text') {
    const target = typeof typedAction.targetDescription === 'string' ? typedAction.targetDescription : 'input';
    return `type_text (${target})`;
  }
  if (type === 'navigate') {
    const url = typeof typedAction.url === 'string' ? typedAction.url : '';
    return `navigate (${url})`;
  }
  return type;
}

wss.on('connection', (ws: WebSocket, req) => {
  const auth = verifyWebSocketAuth(req.url);
  if (!auth.ok) {
    console.warn('Rejected unauthenticated WebSocket connection:', auth.reason);
    ws.close(1008, 'Unauthorized');
    return;
  }

  const sessionId = randomUUID();
  const session: ClientSession = {
    id: sessionId,
    ws,
    conversationHistory: [],
    languageMode: 'auto',
  };
  sessions.set(sessionId, session);

  console.log(`Client connected: ${sessionId}`);

  // Send connected message
  ws.send(JSON.stringify({ type: 'connected', sessionId }));

  ws.on('message', async (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'user_command') {
        session.languageMode = normalizeLanguageMode(msg.languageMode);
        const response = await handleAgentTurn({
          inputType: 'user_command',
          userText: typeof msg.text === 'string' ? msg.text : '',
          screenshotDataUrl: msg.screenshot?.image,
          devicePixelRatio: Number(msg.screenshot?.devicePixelRatio) || 1,
          viewportWidth: Number(msg.screenshot?.viewportWidth) || 1280,
          viewportHeight: Number(msg.screenshot?.viewportHeight) || 720,
          pageUrl: typeof msg.screenshot?.url === 'string' ? msg.screenshot.url : '',
          conversationHistory: session.conversationHistory,
          languageMode: session.languageMode,
        });
        session.conversationHistory = pushConversationTurn(session.conversationHistory, msg.text, response.text);
        ws.send(JSON.stringify(response));
        return;
      }

      if (msg.type === 'action_result') {
        session.languageMode = normalizeLanguageMode(msg.languageMode ?? session.languageMode);
        const actionDescription = summarizeAction(msg.action);
        const actionOutcome = `Action result: ${msg.success ? 'success' : 'failed'}; ${msg.description}`;

        const response = await handleAgentTurn({
          inputType: 'action_result',
          userText: actionOutcome,
          screenshotDataUrl: msg.screenshot?.image,
          devicePixelRatio: Number(msg.screenshot?.devicePixelRatio) || 1,
          viewportWidth: Number(msg.screenshot?.viewportWidth) || 1280,
          viewportHeight: Number(msg.screenshot?.viewportHeight) || 720,
          pageUrl: typeof msg.screenshot?.url === 'string' ? msg.screenshot.url : '',
          conversationHistory: session.conversationHistory,
          languageMode: session.languageMode,
          actionResult: {
            success: Boolean(msg.success),
            description: typeof msg.description === 'string' ? msg.description : 'No result description',
            actionSummary: actionDescription,
          },
        });

        session.conversationHistory = pushConversationTurn(
          session.conversationHistory,
          actionOutcome,
          response.text,
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
