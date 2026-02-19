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
- Before acting, briefly explain what you will do ("I see the login button in the top right, clicking it now")
- When multiple matching elements exist, describe the differences and let the user choose
- High-risk actions (submit, pay, delete) must be confirmed first
- After page changes, proactively summarize the new state
- Keep language concise, avoid lengthy descriptions
- If you cannot see an element clearly, honestly say so and suggest zooming or scrolling

You MUST respond with a JSON object containing:
- "text": A spoken description for the user (string)
- "actions": An array of actions to execute. Each action has a "type" field.

Action types:
- click: { type: "click", x: number, y: number, description: string }
- type_text: { type: "type_text", x: number, y: number, text: string, targetDescription: string }
- scroll: { type: "scroll", direction: "up"|"down"|"left"|"right", amount: number }
- navigate: { type: "navigate", url: string }
- hover: { type: "hover", x: number, y: number, description: string }
- press_key: { type: "press_key", key: string }

If no action is needed (e.g., describing the page), return an empty actions array.

IMPORTANT: x and y coordinates are in the screenshot's pixel space.
The screenshot resolution may differ from CSS pixels due to devicePixelRatio.
Return coordinates in the screenshot's native pixel space - the client will handle the conversion.`;

interface AgentResponse {
  type: 'agent_response';
  text: string;
  actions: Array<Record<string, unknown>>;
}

export async function handleUserCommand(
  userText: string,
  screenshotDataUrl: string,
  devicePixelRatio: number,
  viewportWidth: number,
  viewportHeight: number,
  pageUrl: string,
): Promise<AgentResponse> {
  if (!GEMINI_API_KEY) {
    return {
      type: 'agent_response',
      text: 'Gemini API key not configured. Please set the GEMINI_API_KEY environment variable.',
      actions: [],
    };
  }

  try {
    // Extract base64 image data from data URL
    const base64Image = screenshotDataUrl.replace(/^data:image\/\w+;base64,/, '');

    const contextInfo = `Page URL: ${pageUrl}
Viewport: ${viewportWidth}x${viewportHeight} (DPR: ${devicePixelRatio})
Screenshot pixel dimensions: ${viewportWidth * devicePixelRatio}x${viewportHeight * devicePixelRatio}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-05-20',
      contents: [
        {
          role: 'user',
          parts: [
            { text: `${contextInfo}\n\nUser command: ${userText}` },
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: base64Image,
              },
            },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
      },
    });

    const resultText = response.text ?? '{}';
    const parsed = JSON.parse(resultText);

    return {
      type: 'agent_response',
      text: parsed.text || 'I analyzed the page.',
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
    };
  } catch (err) {
    console.error('Gemini API error:', err);
    return {
      type: 'agent_response',
      text: `Sorry, I encountered an error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      actions: [],
    };
  }
}
