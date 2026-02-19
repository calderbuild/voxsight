import { GoogleGenAI } from '@google/genai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const SYSTEM_INSTRUCTION = `You are VoxSight, a professional web accessibility navigation assistant.
Your mission is to help visually impaired users, people with motor disabilities,
and anyone who needs voice-controlled web browsing.

Core capabilities:
1. Analyze web page screenshots to understand layout, content, and interactive elements
2. Execute precise page actions based on user voice commands
3. Describe page content and action results in clear, concise language

Behavior rules:
- Before acting, briefly explain what you will do
- When multiple matching elements exist, describe differences and ask the user to choose
- High-risk actions (submit, pay, delete, irreversible changes) must require confirmation
- After page changes, proactively summarize the new state
- Keep language concise, avoid lengthy descriptions
- If you cannot see an element clearly, say so and suggest zooming or scrolling
- Reply in the same language as the user (Chinese user input -> Chinese reply, English -> English)

You MUST respond with a JSON object containing:
- "text": spoken feedback for the user (string)
- "actions": an array of actions to execute

Action schema:
- click: { type: "click", x: number, y: number, description: string, confirm?: boolean, confirmPrompt?: string }
- type_text: { type: "type_text", x: number, y: number, text: string, targetDescription: string, confirm?: boolean, confirmPrompt?: string }
- scroll: { type: "scroll", direction: "up"|"down"|"left"|"right", amount: number, confirm?: boolean, confirmPrompt?: string }
- navigate: { type: "navigate", url: string, confirm?: boolean, confirmPrompt?: string }
- hover: { type: "hover", x: number, y: number, description: string, confirm?: boolean, confirmPrompt?: string }
- press_key: { type: "press_key", key: string, confirm?: boolean, confirmPrompt?: string }

For high-risk actions, set confirm=true and provide a short confirmPrompt.
If no action is needed (for example pure description), return an empty actions array.

IMPORTANT: x/y coordinates are in screenshot pixel space, not CSS pixels.`;

export interface ConversationTurn {
  userText: string;
  assistantText: string;
}

type LanguageMode = 'zh' | 'en' | 'auto';

interface AgentActionResultInput {
  success: boolean;
  description: string;
  actionSummary?: string;
}

export interface AgentTurnInput {
  inputType: 'user_command' | 'action_result';
  userText: string;
  screenshotDataUrl?: string;
  devicePixelRatio: number;
  viewportWidth: number;
  viewportHeight: number;
  pageUrl: string;
  conversationHistory: ConversationTurn[];
  languageMode: LanguageMode;
  actionResult?: AgentActionResultInput;
}

interface AgentResponse {
  type: 'agent_response';
  text: string;
  actions: Array<Record<string, unknown>>;
}

function prefersChinese(languageMode: LanguageMode, text: string): boolean {
  if (languageMode === 'zh') return true;
  if (languageMode === 'en') return false;
  return /[\u4e00-\u9fff]/.test(text);
}

function languagePrompt(languageMode: LanguageMode, text: string): string {
  if (languageMode === 'zh') return 'Preferred language: Chinese.';
  if (languageMode === 'en') return 'Preferred language: English.';
  return prefersChinese(languageMode, text)
    ? 'Preferred language: Chinese (auto-detected).'
    : 'Preferred language: English (auto-detected).';
}

function safeJsonParse(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function sanitizeActions(rawActions: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(rawActions)) return [];

  return rawActions
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const action = { ...(item as Record<string, unknown>) };
      if (typeof action.confirm !== 'boolean') {
        delete action.confirm;
      }
      if (typeof action.confirmPrompt !== 'string') {
        delete action.confirmPrompt;
      }
      return action;
    });
}

function buildCurrentTurnText(input: AgentTurnInput): string {
  const contextInfo = `Page URL: ${input.pageUrl}
Viewport: ${input.viewportWidth}x${input.viewportHeight} (DPR: ${input.devicePixelRatio})
Screenshot pixel dimensions: ${Math.round(input.viewportWidth * input.devicePixelRatio)}x${Math.round(input.viewportHeight * input.devicePixelRatio)}
${languagePrompt(input.languageMode, input.userText)}`;

  if (input.inputType === 'action_result') {
    const result = input.actionResult ?? { success: false, description: input.userText };
    return `${contextInfo}

Action execution result:
- Success: ${result.success}
- Description: ${result.description}
- Action: ${result.actionSummary || 'unknown'}

Please verify whether the action had the intended effect on the latest screenshot.
If it failed, suggest a concrete alternative step.`;
  }

  return `${contextInfo}

User command: ${input.userText}`;
}

function buildHistoryContents(history: ConversationTurn[]): Array<Record<string, unknown>> {
  const contents: Array<Record<string, unknown>> = [];
  for (const turn of history) {
    contents.push({
      role: 'user',
      parts: [{ text: turn.userText }],
    });
    contents.push({
      role: 'model',
      parts: [{ text: turn.assistantText }],
    });
  }
  return contents;
}

function friendlyErrorText(languageMode: LanguageMode, text: string): string {
  if (prefersChinese(languageMode, text)) {
    return '我暂时无法完成页面分析，请稍后重试。';
  }
  return 'I could not analyze the page right now. Please try again in a moment.';
}

export async function handleAgentTurn(input: AgentTurnInput): Promise<AgentResponse> {
  if (!GEMINI_API_KEY) {
    return {
      type: 'agent_response',
      text: 'Gemini API key is not configured. Please set GEMINI_API_KEY.',
      actions: [],
    };
  }

  try {
    const contents: Array<Record<string, unknown>> = buildHistoryContents(input.conversationHistory);
    const currentParts: Array<Record<string, unknown>> = [{ text: buildCurrentTurnText(input) }];

    if (input.screenshotDataUrl) {
      const base64Image = input.screenshotDataUrl.replace(/^data:image\/\w+;base64,/, '');
      if (base64Image) {
        currentParts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: base64Image,
          },
        });
      }
    }

    contents.push({
      role: 'user',
      parts: currentParts,
    });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
      },
    });

    const parsed = safeJsonParse(response.text ?? '{}');
    const text = typeof parsed.text === 'string' && parsed.text.trim()
      ? parsed.text
      : (input.inputType === 'action_result'
          ? 'Action checked. Let me know your next step.'
          : 'I analyzed the page.');

    return {
      type: 'agent_response',
      text,
      actions: sanitizeActions(parsed.actions),
    };
  } catch (err) {
    console.error('Gemini API error:', err);
    return {
      type: 'agent_response',
      text: friendlyErrorText(input.languageMode, input.userText),
      actions: [],
    };
  }
}
