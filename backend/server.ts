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
import {
  createLiveSession,
  toolCallToAction,
  type LiveSessionHandle,
  type LiveAgentMessage,
} from './live-agent.js';
import { verifyWebSocketAuth } from './auth.js';

const PORT = parseInt(process.env.PORT || '8080', 10);
// Live API uses WebSocket which bypasses undici's HTTP proxy.
// Disable Live API when proxy is configured (local dev behind firewall).
const USE_LIVE_API = process.env.USE_LIVE_API === 'true'
  || (process.env.USE_LIVE_API !== 'false' && !proxyUrl);

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', service: 'voxsight-backend', liveApi: USE_LIVE_API }));
});

const wss = new WebSocketServer({ server: httpServer });

// --- Shared Helpers ---

type LanguageMode = 'zh' | 'en' | 'auto';

function normalizeLanguageMode(value: unknown): LanguageMode {
  if (value === 'zh' || value === 'en' || value === 'auto') return value;
  return 'auto';
}

function buildContextInfo(msg: Record<string, unknown>, languageMode: LanguageMode): string {
  const screenshot = msg.screenshot as Record<string, unknown> | undefined;
  const pageUrl = typeof screenshot?.url === 'string' ? screenshot.url : '';
  const vpW = Number(screenshot?.viewportWidth) || 1280;
  const vpH = Number(screenshot?.viewportHeight) || 720;
  const dpr = Number(screenshot?.devicePixelRatio) || 1;

  let langLine = 'Preferred language: auto.';
  if (languageMode === 'zh') langLine = 'Preferred language: Chinese.';
  if (languageMode === 'en') langLine = 'Preferred language: English.';

  return `Page URL: ${pageUrl}
Viewport: ${vpW}x${vpH} (DPR: ${dpr})
Screenshot pixel dimensions: ${Math.round(vpW * dpr)}x${Math.round(vpH * dpr)}
${langLine}`;
}

// --- Legacy (generateContent) Session ---

interface LegacySession {
  mode: 'legacy';
  id: string;
  ws: WebSocket;
  conversationHistory: ConversationTurn[];
  languageMode: LanguageMode;
}

function pushConversationTurn(
  history: ConversationTurn[],
  userText: string,
  assistantText: string,
): ConversationTurn[] {
  const next = [...history, { userText, assistantText }];
  if (next.length <= 10) return next;
  return [next[0], ...next.slice(-8)];
}

function summarizeAction(action: unknown): string {
  if (!action || typeof action !== 'object') return 'unknown action';
  const a = action as Record<string, unknown>;
  const type = typeof a.type === 'string' ? a.type : 'unknown';
  if (type === 'click') return `click (${a.description ?? 'target'})`;
  if (type === 'type_text') return `type_text (${a.targetDescription ?? 'input'})`;
  if (type === 'navigate') return `navigate (${a.url ?? ''})`;
  return type;
}

async function handleLegacyMessage(session: LegacySession, msg: Record<string, unknown>): Promise<void> {
  const { ws } = session;

  if (msg.type === 'user_command') {
    session.languageMode = normalizeLanguageMode(msg.languageMode);
    const response = await handleAgentTurn({
      inputType: 'user_command',
      userText: typeof msg.text === 'string' ? msg.text : '',
      screenshotDataUrl: (msg.screenshot as Record<string, unknown>)?.image as string | undefined,
      devicePixelRatio: Number((msg.screenshot as Record<string, unknown>)?.devicePixelRatio) || 1,
      viewportWidth: Number((msg.screenshot as Record<string, unknown>)?.viewportWidth) || 1280,
      viewportHeight: Number((msg.screenshot as Record<string, unknown>)?.viewportHeight) || 720,
      pageUrl: typeof (msg.screenshot as Record<string, unknown>)?.url === 'string'
        ? (msg.screenshot as Record<string, unknown>).url as string : '',
      conversationHistory: session.conversationHistory,
      languageMode: session.languageMode,
    });
    session.conversationHistory = pushConversationTurn(
      session.conversationHistory, msg.text as string, response.text,
    );
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
      screenshotDataUrl: (msg.screenshot as Record<string, unknown>)?.image as string | undefined,
      devicePixelRatio: Number((msg.screenshot as Record<string, unknown>)?.devicePixelRatio) || 1,
      viewportWidth: Number((msg.screenshot as Record<string, unknown>)?.viewportWidth) || 1280,
      viewportHeight: Number((msg.screenshot as Record<string, unknown>)?.viewportHeight) || 720,
      pageUrl: typeof (msg.screenshot as Record<string, unknown>)?.url === 'string'
        ? (msg.screenshot as Record<string, unknown>).url as string : '',
      conversationHistory: session.conversationHistory,
      languageMode: session.languageMode,
      actionResult: {
        success: Boolean(msg.success),
        description: typeof msg.description === 'string' ? msg.description : 'No result description',
        actionSummary: actionDescription,
      },
    });
    session.conversationHistory = pushConversationTurn(
      session.conversationHistory, actionOutcome, response.text,
    );
    ws.send(JSON.stringify(response));
  }
}

// --- Live API Session ---

interface LiveClientSession {
  mode: 'live';
  id: string;
  ws: WebSocket;
  liveSession: LiveSessionHandle;
  languageMode: LanguageMode;
  textBuffer: string;
}

async function createLiveClientSession(
  sessionId: string,
  ws: WebSocket,
): Promise<LiveClientSession> {
  const clientSession: LiveClientSession = {
    mode: 'live',
    id: sessionId,
    ws,
    liveSession: null as unknown as LiveSessionHandle,
    languageMode: 'auto',
    textBuffer: '',
  };

  const liveSession = await createLiveSession((msg: LiveAgentMessage) => {
    if (ws.readyState !== WebSocket.OPEN) return;

    switch (msg.type) {
      case 'text':
        // Stream text delta to client immediately for real-time feel
        clientSession.textBuffer += msg.text ?? '';
        if (msg.text) {
          ws.send(JSON.stringify({ type: 'text_delta', delta: msg.text }));
        }
        break;

      case 'tool_call': {
        // Convert tool call to legacy action format and send to client
        const action = toolCallToAction(msg.toolCall!.name, msg.toolCall!.args);
        const response = {
          type: 'tool_call' as const,
          callId: msg.toolCall!.id,
          action,
          text: clientSession.textBuffer || undefined,
        };
        clientSession.textBuffer = '';
        ws.send(JSON.stringify(response));
        break;
      }

      case 'turn_complete': {
        // Send any accumulated text as agent_response
        if (clientSession.textBuffer) {
          ws.send(JSON.stringify({
            type: 'agent_response',
            text: clientSession.textBuffer,
            actions: [],
          }));
          clientSession.textBuffer = '';
        }
        break;
      }

      case 'error':
        ws.send(JSON.stringify({
          type: 'error',
          message: msg.error ?? 'Live session error',
        }));
        break;
    }
  });

  clientSession.liveSession = liveSession;
  return clientSession;
}

function handleLiveMessage(session: LiveClientSession, msg: Record<string, unknown>): void {
  session.languageMode = normalizeLanguageMode(msg.languageMode ?? session.languageMode);
  const contextInfo = buildContextInfo(msg, session.languageMode);

  if (msg.type === 'user_command') {
    const userText = typeof msg.text === 'string' ? msg.text : '';
    const screenshot = msg.screenshot as Record<string, unknown> | undefined;
    const imageDataUrl = screenshot?.image as string | undefined;

    if (imageDataUrl) {
      // Strip data URL prefix to get raw base64
      const base64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
      session.liveSession.sendScreenshotAndCommand(base64, 'image/jpeg', userText, contextInfo);
    } else {
      session.liveSession.sendTextOnly(`User command: ${userText}`, contextInfo);
    }
    return;
  }

  if (msg.type === 'action_result') {
    const success = Boolean(msg.success);
    const description = typeof msg.description === 'string' ? msg.description : 'No description';
    const screenshot = msg.screenshot as Record<string, unknown> | undefined;
    const imageDataUrl = screenshot?.image as string | undefined;

    if (imageDataUrl) {
      const base64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
      session.liveSession.sendScreenshotAndCommand(
        base64, 'image/jpeg',
        `Action result: ${success ? 'success' : 'failed'}. ${description}. Please verify the result on the screenshot.`,
        contextInfo,
      );
    } else {
      session.liveSession.sendTextOnly(
        `Action result: ${success ? 'success' : 'failed'}. ${description}`,
        contextInfo,
      );
    }
    return;
  }

  if (msg.type === 'tool_response') {
    const callId = typeof msg.callId === 'string' ? msg.callId : '';
    const result = (msg.result ?? {}) as Record<string, unknown>;
    session.liveSession.sendToolResponse(callId, result);
  }
}

// --- Connection Handling ---

type ClientSession = LegacySession | LiveClientSession;
const sessions = new Map<string, ClientSession>();

wss.on('connection', async (ws: WebSocket, req) => {
  const auth = verifyWebSocketAuth(req.url);
  if (!auth.ok) {
    console.warn('Rejected unauthenticated WebSocket connection:', auth.reason);
    ws.close(1008, 'Unauthorized');
    return;
  }

  const sessionId = randomUUID();
  let session: ClientSession;

  if (USE_LIVE_API) {
    try {
      session = await createLiveClientSession(sessionId, ws);
      console.log(`Client connected (Live): ${sessionId}`);
    } catch (err) {
      console.error(`Failed to create Live session, falling back to legacy:`, err);
      session = {
        mode: 'legacy',
        id: sessionId,
        ws,
        conversationHistory: [],
        languageMode: 'auto',
      };
      console.log(`Client connected (Legacy fallback): ${sessionId}`);
    }
  } else {
    session = {
      mode: 'legacy',
      id: sessionId,
      ws,
      conversationHistory: [],
      languageMode: 'auto',
    };
    console.log(`Client connected (Legacy): ${sessionId}`);
  }

  sessions.set(sessionId, session);
  ws.send(JSON.stringify({ type: 'connected', sessionId, mode: session.mode }));

  ws.on('message', async (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString()) as Record<string, unknown>;

      if (session.mode === 'live') {
        handleLiveMessage(session as LiveClientSession, msg);
      } else {
        await handleLegacyMessage(session as LegacySession, msg);
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
    if (session.mode === 'live') {
      (session as LiveClientSession).liveSession.close();
    }
    sessions.delete(sessionId);
  });

  ws.on('error', (err) => {
    console.error(`WebSocket error for ${sessionId}:`, err);
    if (session.mode === 'live') {
      (session as LiveClientSession).liveSession.close();
    }
    sessions.delete(sessionId);
  });
});

httpServer.listen(PORT, () => {
  console.log(`VoxSight backend running on port ${PORT} (Live API: ${USE_LIVE_API})`);
});
