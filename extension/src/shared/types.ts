// Message types between Extension components and Backend

export type ActionType =
  | 'click'
  | 'type_text'
  | 'scroll'
  | 'navigate'
  | 'hover'
  | 'select_option'
  | 'press_key'
  | 'describe_page'
  | 'find_element'
  | 'read_content';

export type LanguageMode = 'zh' | 'en' | 'auto';

export interface ActionMeta {
  confirm?: boolean;
  confirmPrompt?: string;
}

export interface ClickAction {
  type: 'click';
  x: number;
  y: number;
  description: string;
}

export interface TypeTextAction {
  type: 'type_text';
  text: string;
  targetDescription: string;
  x: number;
  y: number;
}

export interface ScrollAction {
  type: 'scroll';
  direction: 'up' | 'down' | 'left' | 'right';
  amount: number;
}

export interface NavigateAction {
  type: 'navigate';
  url: string;
}

export interface HoverAction {
  type: 'hover';
  x: number;
  y: number;
  description: string;
}

export interface SelectOptionAction {
  type: 'select_option';
  x: number;
  y: number;
  value: string;
  description: string;
}

export interface PressKeyAction {
  type: 'press_key';
  key: string;
}

export interface DescribePageAction {
  type: 'describe_page';
}

export interface FindElementAction {
  type: 'find_element';
  description: string;
}

export interface ReadContentAction {
  type: 'read_content';
  region: string;
}

export type AgentAction = (
  | ClickAction
  | TypeTextAction
  | ScrollAction
  | NavigateAction
  | HoverAction
  | SelectOptionAction
  | PressKeyAction
  | DescribePageAction
  | FindElementAction
  | ReadContentAction
) & ActionMeta;

// WebSocket message types (Extension <-> Backend)

export interface ScreenshotMessage {
  type: 'screenshot';
  image: string; // base64 JPEG
  devicePixelRatio: number;
  viewportWidth: number;
  viewportHeight: number;
  url: string;
  title: string;
}

export interface UserCommandMessage {
  type: 'user_command';
  text: string;
  screenshot: ScreenshotMessage;
  languageMode?: LanguageMode;
}

export interface AgentResponseMessage {
  type: 'agent_response';
  text: string; // spoken feedback
  actions: AgentAction[];
}

export interface ActionResultMessage {
  type: 'action_result';
  success: boolean;
  description: string;
  action?: AgentAction;
  languageMode?: LanguageMode;
  screenshot?: ScreenshotMessage;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export interface ConnectedMessage {
  type: 'connected';
  sessionId: string;
  mode?: 'live' | 'legacy';
}

// Live API: server asks client to execute a tool call (action)
export interface ToolCallMessage {
  type: 'tool_call';
  callId: string;
  action: AgentAction;
  text?: string; // optional spoken text before the action
}

// Live API: client sends tool execution result back to server
export interface ToolResponseMessage {
  type: 'tool_response';
  callId: string;
  result: {
    name: string;
    success: boolean;
    description: string;
  };
}

export type WSMessage =
  | UserCommandMessage
  | AgentResponseMessage
  | ActionResultMessage
  | ErrorMessage
  | ConnectedMessage
  | ToolCallMessage
  | ToolResponseMessage;

// Internal Chrome extension messages (between components)

export interface CaptureScreenshotRequest {
  action: 'captureScreenshot';
}

export interface CaptureScreenshotResponse {
  image: string;
  devicePixelRatio: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface ExecuteActionRequest {
  action: 'executeAction';
  agentAction: AgentAction;
}

export interface ExecuteActionResponse {
  success: boolean;
  description: string;
}

export type ExtensionMessage =
  | CaptureScreenshotRequest
  | ExecuteActionRequest;
