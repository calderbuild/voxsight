import {
  GoogleGenAI,
  Modality,
  type Session,
  type LiveServerMessage,
  type FunctionDeclaration,
} from '@google/genai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const LIVE_MODEL = 'gemini-live-2.5-flash-preview';

const SYSTEM_INSTRUCTION = `You are VoxSight, a professional web accessibility navigation assistant.
Your mission is to help visually impaired users, people with motor disabilities,
and anyone who needs voice-controlled web browsing.

Core capabilities:
1. Analyze web page screenshots to understand layout, content, and interactive elements
2. Execute precise page actions based on user voice commands via tool calls
3. Describe page content and action results in clear, concise language

Behavior rules:
- Before acting, briefly explain what you will do
- When multiple matching elements exist, describe differences and ask the user to choose
- High-risk actions (submit, pay, delete, irreversible changes) must require confirmation
- After page changes, proactively summarize the new state
- Keep language concise, avoid lengthy descriptions
- If you cannot see an element clearly, say so and suggest zooming or scrolling
- Reply in the same language as the user (Chinese user input -> Chinese reply, English -> English)
- Use tool calls to perform actions on the page; never output raw JSON action arrays
- x/y coordinates in tool calls are in screenshot pixel space, not CSS pixels

IMPORTANT: When the user asks to perform an action, use the appropriate tool call.
When the user asks for a description or information, respond with text only.`;

const clickDeclaration: FunctionDeclaration = {
  name: 'click_element',
  description: 'Click on an element at the given screenshot pixel coordinates',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      x: { type: 'number', description: 'X coordinate in screenshot pixel space' },
      y: { type: 'number', description: 'Y coordinate in screenshot pixel space' },
      description: { type: 'string', description: 'Human-readable label for what is being clicked' },
      confirm: { type: 'boolean', description: 'True if this is a high-risk action requiring user confirmation' },
      confirmPrompt: { type: 'string', description: 'Confirmation prompt text for high-risk actions' },
    },
    required: ['x', 'y', 'description'],
  },
};

const typeTextDeclaration: FunctionDeclaration = {
  name: 'type_text',
  description: 'Type text into an input field at the given screenshot pixel coordinates',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      x: { type: 'number', description: 'X coordinate of the input field in screenshot pixel space' },
      y: { type: 'number', description: 'Y coordinate of the input field in screenshot pixel space' },
      text: { type: 'string', description: 'The text to type' },
      targetDescription: { type: 'string', description: 'Human-readable label for the input field' },
      confirm: { type: 'boolean', description: 'True if this is a high-risk action requiring user confirmation' },
      confirmPrompt: { type: 'string', description: 'Confirmation prompt text for high-risk actions' },
    },
    required: ['x', 'y', 'text', 'targetDescription'],
  },
};

const scrollDeclaration: FunctionDeclaration = {
  name: 'scroll_page',
  description: 'Scroll the page in a given direction',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: 'Scroll direction' },
      amount: { type: 'number', description: 'Scroll distance in pixels (typically 300-800)' },
    },
    required: ['direction', 'amount'],
  },
};

const navigateDeclaration: FunctionDeclaration = {
  name: 'navigate_to',
  description: 'Navigate the browser to a URL',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to navigate to (must start with http:// or https://)' },
      confirm: { type: 'boolean', description: 'True if this is a high-risk action requiring user confirmation' },
      confirmPrompt: { type: 'string', description: 'Confirmation prompt text for high-risk actions' },
    },
    required: ['url'],
  },
};

const hoverDeclaration: FunctionDeclaration = {
  name: 'hover_element',
  description: 'Hover the mouse over an element at the given screenshot pixel coordinates',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      x: { type: 'number', description: 'X coordinate in screenshot pixel space' },
      y: { type: 'number', description: 'Y coordinate in screenshot pixel space' },
      description: { type: 'string', description: 'Human-readable label for the element' },
    },
    required: ['x', 'y', 'description'],
  },
};

const pressKeyDeclaration: FunctionDeclaration = {
  name: 'press_key',
  description: 'Press a keyboard key (e.g. Enter, Tab, Escape, Backspace)',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'The key to press (e.g. "Enter", "Tab", "Escape")' },
    },
    required: ['key'],
  },
};

const ALL_TOOL_DECLARATIONS = [
  clickDeclaration,
  typeTextDeclaration,
  scrollDeclaration,
  navigateDeclaration,
  hoverDeclaration,
  pressKeyDeclaration,
];

export type LiveMessageHandler = (msg: LiveAgentMessage) => void;

export interface LiveAgentMessage {
  type: 'text' | 'tool_call' | 'turn_complete' | 'error';
  text?: string;
  toolCall?: {
    id: string;
    name: string;
    args: Record<string, unknown>;
  };
  error?: string;
}

export interface LiveSessionHandle {
  sendScreenshotAndCommand(
    screenshotBase64: string,
    mimeType: string,
    userText: string,
    contextInfo: string,
  ): void;
  sendToolResponse(callId: string, result: Record<string, unknown>): void;
  sendTextOnly(text: string, contextInfo: string): void;
  close(): void;
}

export async function createLiveSession(
  onMessage: LiveMessageHandler,
): Promise<LiveSessionHandle> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const session: Session = await ai.live.connect({
    model: LIVE_MODEL,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseModalities: [Modality.TEXT],
      tools: [{ functionDeclarations: ALL_TOOL_DECLARATIONS }],
    },
    callbacks: {
      onopen: () => {
        console.log('[LiveAgent] Session opened');
      },
      onmessage: (message: LiveServerMessage) => {
        handleLiveMessage(message, onMessage);
      },
      onerror: (error: ErrorEvent) => {
        console.error('[LiveAgent] Session error:', error);
        onMessage({ type: 'error', error: error.message || 'Live session error' });
      },
      onclose: (event: CloseEvent) => {
        console.log('[LiveAgent] Session closed:', event.code, event.reason);
      },
    },
  });

  return {
    sendScreenshotAndCommand(
      screenshotBase64: string,
      mimeType: string,
      userText: string,
      contextInfo: string,
    ) {
      // Send screenshot as realtime input for faster processing
      session.sendRealtimeInput({
        media: {
          data: screenshotBase64,
          mimeType,
        },
      });

      // Send text command as client content
      session.sendClientContent({
        turns: [
          {
            role: 'user',
            parts: [{ text: `${contextInfo}\n\nUser command: ${userText}` }],
          },
        ],
        turnComplete: true,
      });
    },

    sendToolResponse(callId: string, result: Record<string, unknown>) {
      session.sendToolResponse({
        functionResponses: [
          {
            id: callId,
            name: result.name as string,
            response: result,
          },
        ],
      });
    },

    sendTextOnly(text: string, contextInfo: string) {
      session.sendClientContent({
        turns: [
          {
            role: 'user',
            parts: [{ text: `${contextInfo}\n\n${text}` }],
          },
        ],
        turnComplete: true,
      });
    },

    close() {
      session.close();
    },
  };
}

function handleLiveMessage(
  message: LiveServerMessage,
  onMessage: LiveMessageHandler,
): void {
  // Handle model text responses
  if (message.serverContent?.modelTurn?.parts) {
    for (const part of message.serverContent.modelTurn.parts) {
      if (part.text) {
        onMessage({ type: 'text', text: part.text });
      }
    }
  }

  // Handle turn completion
  if (message.serverContent?.turnComplete) {
    onMessage({ type: 'turn_complete' });
  }

  // Handle tool calls (function calling)
  if (message.toolCall?.functionCalls) {
    for (const fc of message.toolCall.functionCalls) {
      onMessage({
        type: 'tool_call',
        toolCall: {
          id: fc.id ?? '',
          name: fc.name ?? '',
          args: (fc.args ?? {}) as Record<string, unknown>,
        },
      });
    }
  }
}

// Convert Live API tool call to legacy AgentAction format for extension compatibility
export function toolCallToAction(
  name: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  switch (name) {
    case 'click_element':
      return {
        type: 'click',
        x: args.x,
        y: args.y,
        description: args.description ?? '',
        confirm: args.confirm,
        confirmPrompt: args.confirmPrompt,
      };
    case 'type_text':
      return {
        type: 'type_text',
        x: args.x,
        y: args.y,
        text: args.text,
        targetDescription: args.targetDescription ?? '',
        confirm: args.confirm,
        confirmPrompt: args.confirmPrompt,
      };
    case 'scroll_page':
      return {
        type: 'scroll',
        direction: args.direction,
        amount: args.amount,
      };
    case 'navigate_to':
      return {
        type: 'navigate',
        url: args.url,
        confirm: args.confirm,
        confirmPrompt: args.confirmPrompt,
      };
    case 'hover_element':
      return {
        type: 'hover',
        x: args.x,
        y: args.y,
        description: args.description ?? '',
      };
    case 'press_key':
      return {
        type: 'press_key',
        key: args.key,
      };
    default:
      return { type: name, ...args };
  }
}
