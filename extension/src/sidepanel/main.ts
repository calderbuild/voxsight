import type {
  ActionResultMessage,
  AgentAction,
  AgentResponseMessage,
  CaptureScreenshotResponse,
  ConnectedMessage,
  ErrorMessage,
  ExecuteActionResponse,
  LanguageMode,
  ScreenshotMessage,
  TextDeltaMessage,
  ToolCallMessage,
  ToolResponseMessage,
  UserCommandMessage,
  WSMessage,
} from '../shared/types';
import { BACKEND_URL, SCREENSHOT_CONFIG, STORAGE_KEYS } from '../shared/constants';
import { createAuthenticatedWebSocketUrl } from '../shared/auth';

// DOM elements
const pageDescription = document.getElementById('pageDescription') as HTMLElement;
const pageDescriptionText = pageDescription.querySelector('.page-description__text') as HTMLElement;
const conversation = document.getElementById('conversation') as HTMLElement;
const voiceBtn = document.getElementById('voiceBtn') as HTMLButtonElement;
const voiceBtnLabel = voiceBtn.querySelector('.voice-btn__label') as HTMLSpanElement;
const textInput = document.getElementById('textInput') as HTMLInputElement;
const describeBtn = document.getElementById('describeBtn') as HTMLButtonElement;
const readBtn = document.getElementById('readBtn') as HTMLButtonElement;
const languageSelect = document.getElementById('languageSelect') as HTMLSelectElement;
const confirmPanel = document.getElementById('confirmPanel') as HTMLElement;
const confirmText = document.getElementById('confirmText') as HTMLElement;
const confirmYesBtn = document.getElementById('confirmYesBtn') as HTMLButtonElement;
const confirmNoBtn = document.getElementById('confirmNoBtn') as HTMLButtonElement;
const contrastBtn = document.getElementById('contrastBtn') as HTMLButtonElement;
const fontSizeBtn = document.getElementById('fontSizeBtn') as HTMLButtonElement;

// State
let ws: WebSocket | null = null;
let isListening = false;
let recognition: SpeechRecognition | null = null;
let synthesis = window.speechSynthesis;
let languageMode: LanguageMode = 'auto';
let backendTimeoutId: number | null = null;
let waitingForConnectionRecovery = false;
let sessionMode: 'live' | 'legacy' = 'legacy';
let streamingMessageEl: HTMLElement | null = null; // current streaming message bubble
let streamingText = ''; // accumulated text for current stream

interface PendingConfirmation {
  action: AgentAction;
  resolve: (approved: boolean) => void;
}

let pendingConfirmation: PendingConfirmation | null = null;

type FontSizeMode = 'normal' | 'large' | 'xlarge';

interface SidePanelSettings {
  languageMode: LanguageMode;
  highContrast: boolean;
  fontSizeMode: FontSizeMode;
}

const BACKEND_TIMEOUT_MS = 30_000; // 30s for Live API streaming
const NON_SCRIPTABLE_URL_PREFIXES = ['chrome://', 'chrome-extension://', 'about:', 'edge://', 'devtools://', 'view-source:'];
const NON_SCRIPTABLE_HOSTS = new Set(['chrome.google.com', 'chromewebstore.google.com']);

// --- WebSocket ---

async function connectWebSocket(): Promise<void> {
  let wsUrl = BACKEND_URL;
  try {
    wsUrl = await createAuthenticatedWebSocketUrl(BACKEND_URL);
  } catch (err) {
    console.error('[VoxSight] Failed to create auth token:', err);
    addStatusMessage('Connection setup failed. Retrying...');
    setTimeout(() => void connectWebSocket(), 3000);
    return;
  }

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    if (waitingForConnectionRecovery) {
      addStatusMessage('Connection restored.');
      waitingForConnectionRecovery = false;
    } else {
      addStatusMessage('Connected to VoxSight backend.');
    }
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data) as WSMessage;
    void handleServerMessage(msg);
  };

  ws.onerror = () => {
    addStatusMessage('Connection error. Retrying...');
  };

  ws.onclose = () => {
    waitingForConnectionRecovery = true;
    addStatusMessage('Connection lost. Reconnecting...');
    setTimeout(() => void connectWebSocket(), 3000);
  };
}

function sendMessage(msg: WSMessage): boolean {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
    return true;
  }

  addErrorMessage('Backend is not connected yet. Please wait and retry.');
  return false;
}

function startBackendTimeout(label: string): void {
  clearBackendTimeout();
  backendTimeoutId = window.setTimeout(() => {
    addErrorMessage(`Backend timeout during ${label}. Please retry.`);
    clearProcessingState();
  }, BACKEND_TIMEOUT_MS);
}

function clearBackendTimeout(): void {
  if (backendTimeoutId !== null) {
    window.clearTimeout(backendTimeoutId);
    backendTimeoutId = null;
  }
}

async function handleServerMessage(msg: WSMessage): Promise<void> {
  switch (msg.type) {
    case 'connected': {
      const connMsg = msg as ConnectedMessage;
      sessionMode = connMsg.mode ?? 'legacy';
      addStatusMessage(`Session: ${connMsg.sessionId} (${sessionMode})`);
      return;
    }

    case 'text_delta': {
      // Live API: streaming text chunk -- display incrementally
      clearBackendTimeout();
      const deltaMsg = msg as TextDeltaMessage;
      appendStreamingDelta(deltaMsg.delta);
      startBackendTimeout('streaming response');
      return;
    }

    case 'agent_response': {
      clearBackendTimeout();
      // Finalize any in-progress streaming message first
      finalizeStreamingMessage();
      const response = msg as AgentResponseMessage;
      // Only add a new message if there wasn't a streaming one
      if (!streamingMessageEl && response.text) {
        pageDescriptionText.textContent = response.text;
        addAgentMessage(response.text);
        speak(response.text);
      }
      if (sessionMode === 'legacy') {
        await processAgentActions(response.actions);
        if (response.actions.length === 0) {
          clearProcessingState();
        }
      } else {
        // In live mode, agent_response with no actions means turn complete
        clearProcessingState();
      }
      return;
    }

    case 'tool_call': {
      clearBackendTimeout();
      // Finalize any streaming text before executing action
      finalizeStreamingMessage();
      const tcMsg = msg as ToolCallMessage;
      // Show any text that came before the tool call (from non-streaming path)
      if (tcMsg.text && !streamingText) {
        pageDescriptionText.textContent = tcMsg.text;
        addAgentMessage(tcMsg.text);
        speak(tcMsg.text);
      }
      // Execute the action and send result back
      await handleToolCall(tcMsg.callId, tcMsg.action);
      return;
    }

    case 'error':
      clearBackendTimeout();
      addErrorMessage((msg as ErrorMessage).message);
      clearProcessingState();
      return;
  }
}

// --- Live API Tool Call Handling ---

async function handleToolCall(callId: string, action: AgentAction): Promise<void> {
  setProcessingState('Executing...');

  // Check confirmation
  const shouldRun = await requestActionConfirmationIfNeeded(action);
  if (!shouldRun) {
    const cancelDesc = languageMode === 'zh' ? '用户取消了该操作' : 'User cancelled this action';
    sendToolResponse(callId, action.type, false, cancelDesc);
    clearProcessingState();
    return;
  }

  // Execute the action
  const result = await executeAction(action);
  addStatusMessage(`${describeAction(action)}: ${result.success ? 'OK' : result.description}`);

  // Wait for page to settle, then capture screenshot and send result
  await delay(500);
  const screenshot = await captureCurrentScreenshotMessage();

  // Send tool response with result
  sendToolResponse(callId, action.type, result.success, result.description);

  // Also send the post-action screenshot for verification
  if (screenshot) {
    const verifyMsg: ActionResultMessage = {
      type: 'action_result',
      success: result.success,
      description: result.description,
      action,
      languageMode,
      screenshot,
    };
    sendMessage(verifyMsg);
  }

  setProcessingState('Verifying...');
  startBackendTimeout('action verification');
}

function sendToolResponse(callId: string, actionName: string, success: boolean, description: string): void {
  const msg: ToolResponseMessage = {
    type: 'tool_response',
    callId,
    result: {
      name: actionName,
      success,
      description,
    },
  };
  sendMessage(msg);
}

// --- Voice Input ---

function initSpeechRecognition(): void {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showTextInput();
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  applyRecognitionLanguage();

  recognition.onresult = (event) => {
    const result = event.results[0];
    if (!result.isFinal) return;

    const text = result[0].transcript;
    const confidence = result[0].confidence;

    if (pendingConfirmation) {
      handleConfirmationSpeech(text);
      return;
    }

    if (confidence < 0.5) {
      addAgentMessage('Sorry, I did not catch that. Please try again.');
      speak('Sorry, I did not catch that. Please try again.');
      return;
    }

    void handleUserInput(text);
  };

  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    if (event.error === 'not-allowed') {
      showTextInput();
      addStatusMessage('Microphone access denied. Use text input instead.');
    }
    stopListening();
  };

  recognition.onend = () => {
    stopListening();
  };
}

function startListening(): void {
  if (!recognition) return;
  isListening = true;
  voiceBtn.classList.add('voice-btn--listening');
  voiceBtnLabel.textContent = 'Listening...';
  recognition.start();
}

function stopListening(): void {
  if (!recognition) return;
  isListening = false;
  voiceBtn.classList.remove('voice-btn--listening');
  if (!voiceBtn.classList.contains('voice-btn--processing')) {
    voiceBtnLabel.textContent = 'Hold to speak';
  }
  try {
    recognition.stop();
  } catch {
    // no-op
  }
}

function showTextInput(): void {
  textInput.style.display = 'block';
  voiceBtn.style.display = 'none';
}

function applyRecognitionLanguage(): void {
  if (!recognition) return;
  if (languageMode === 'zh') {
    recognition.lang = 'zh-CN';
    return;
  }
  if (languageMode === 'en') {
    recognition.lang = 'en-US';
    return;
  }
  recognition.lang = navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
}

// --- Voice Output ---

function detectSpeechLang(text: string): string {
  if (languageMode === 'zh') return 'zh-CN';
  if (languageMode === 'en') return 'en-US';
  return /[\u4e00-\u9fff]/.test(text) ? 'zh-CN' : 'en-US';
}

function getBestVoice(lang: string): SpeechSynthesisVoice | null {
  const voices = synthesis.getVoices();
  if (!voices.length) return null;
  // Prefer enhanced/premium voices (e.g. macOS "Samantha (Enhanced)", Google voices)
  const enhanced = voices.find(v => v.lang.startsWith(lang.slice(0, 2)) && /(enhanced|premium|google)/i.test(v.name));
  if (enhanced) return enhanced;
  // Fallback: exact lang match
  const exact = voices.find(v => v.lang === lang);
  if (exact) return exact;
  // Fallback: language prefix match
  return voices.find(v => v.lang.startsWith(lang.slice(0, 2))) ?? null;
}

function speak(text: string): void {
  synthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = detectSpeechLang(text);
  utterance.rate = 1.0;
  const voice = getBestVoice(utterance.lang);
  if (voice) utterance.voice = voice;
  synthesis.speak(utterance);
}

// --- Actions ---

async function handleUserInput(text: string): Promise<void> {
  addUserMessage(text);

  // Check for about:blank or empty page
  const tab = await findWebTab();
  if (!tab || tab.url === 'about:blank' || !tab.url) {
    const msg = languageMode === 'zh'
      ? '当前页面为空白页，请先打开一个网页。'
      : 'Current page is blank. Please open a webpage first.';
    addErrorMessage(msg);
    speak(msg);
    return;
  }

  const screenshot = await captureCurrentScreenshotMessage();
  if (!screenshot) {
    addErrorMessage('Failed to capture screenshot. Use a regular webpage (http/https), not chrome:// pages.');
    clearProcessingState();
    return;
  }

  const msg: UserCommandMessage = {
    type: 'user_command',
    text,
    languageMode,
    screenshot,
  };

  if (!sendMessage(msg)) {
    return;
  }

  setProcessingState('Analyzing...');
  startBackendTimeout('analysis');
}

async function processAgentActions(actions: AgentAction[]): Promise<void> {
  if (actions.length === 0) return;

  const results: ExecuteActionResponse[] = [];
  let lastAction: AgentAction | undefined;

  for (const action of actions) {
    lastAction = action;
    const shouldRun = await requestActionConfirmationIfNeeded(action);
    if (!shouldRun) {
      const cancelMessage = languageMode === 'zh' ? '用户取消了该操作。' : 'User cancelled this action.';
      results.push({ success: false, description: cancelMessage });
      break;
    }

    const result = await executeAction(action);
    results.push(result);
    if (!result.success) {
      break;
    }
  }

  if (!lastAction || results.length === 0) {
    clearProcessingState();
    return;
  }

  await delay(500);

  const screenshot = await captureCurrentScreenshotMessage();
  const actionSummary = results.map((result) => result.description).join(' | ');
  const finalResult: ActionResultMessage = {
    type: 'action_result',
    success: results.every((result) => result.success),
    description: screenshot ? actionSummary : `${actionSummary} | Follow-up screenshot unavailable.`,
    action: lastAction,
    languageMode,
    screenshot: screenshot || undefined,
  };

  if (sendMessage(finalResult)) {
    setProcessingState('Verifying...');
    startBackendTimeout('action verification');
  } else {
    clearProcessingState();
  }
}

async function executeAction(action: AgentAction): Promise<ExecuteActionResponse> {
  const tab = await findWebTab();
  if (!tab?.id) {
    return { success: false, description: 'No scriptable tab available for action execution.' };
  }

  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, { action: 'executeAction', agentAction: action }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({
          success: false,
          description: `Action failed: ${chrome.runtime.lastError.message}`,
        });
        return;
      }
      if (!response) {
        resolve({ success: false, description: 'Action failed: no response from content script.' });
        return;
      }
      resolve(response as ExecuteActionResponse);
    });
  });
}

async function requestActionConfirmationIfNeeded(action: AgentAction): Promise<boolean> {
  const prompt = buildConfirmationPrompt(action);
  if (!prompt) {
    return true;
  }

  return new Promise<boolean>((resolve) => {
    pendingConfirmation = { action, resolve };
    confirmText.textContent = prompt;
    confirmPanel.hidden = false;
    speak(prompt);
    addStatusMessage(prompt);
  });
}

function buildConfirmationPrompt(action: AgentAction): string | null {
  if (typeof action.confirmPrompt === 'string' && action.confirmPrompt.trim()) {
    return action.confirmPrompt;
  }

  const riskyText = JSON.stringify(action).toLowerCase();
  const isRisky = action.confirm === true || /(delete|remove|submit|pay|purchase|checkout|transfer|send|confirm order)/.test(riskyText);
  if (!isRisky) {
    return null;
  }

  const actionText = describeAction(action);
  return languageMode === 'zh'
    ? `这是高风险操作：${actionText}。是否继续？`
    : `This is a high-risk action: ${actionText}. Do you want to continue?`;
}

function describeAction(action: AgentAction): string {
  switch (action.type) {
    case 'click':
      return `click "${action.description || 'target'}"`;
    case 'type_text':
      return `type "${action.text}"`;
    case 'navigate':
      return `navigate to ${action.url}`;
    case 'scroll':
      return `scroll ${action.direction}`;
    case 'press_key':
      return `press ${action.key}`;
    default:
      return action.type;
  }
}

function resolveConfirmation(approved: boolean): void {
  if (!pendingConfirmation) return;
  const { resolve } = pendingConfirmation;
  pendingConfirmation = null;
  confirmPanel.hidden = true;
  resolve(approved);
}

function handleConfirmationSpeech(text: string): void {
  const normalized = text.trim().toLowerCase();
  const yes = /\b(yes|confirm|ok|okay|sure|proceed|go ahead)\b/.test(normalized) || /^(是|确认|可以|继续|好的)$/.test(text.trim());
  const no = /\b(no|cancel|stop|don't|do not)\b/.test(normalized) || /^(不|取消|不要|停止)$/.test(text.trim());

  if (yes) {
    addUserMessage(text);
    resolveConfirmation(true);
    return;
  }
  if (no) {
    addUserMessage(text);
    resolveConfirmation(false);
    return;
  }

  const retryText = languageMode === 'zh' ? '请回答“确认”或“取消”。' : 'Please say yes/confirm or no/cancel.';
  addStatusMessage(retryText);
  speak(retryText);
}

async function findWebTab(): Promise<chrome.tabs.Tab | undefined> {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const activeTab = tabs.find((tab) => tab.active && isScriptableUrl(tab.url));
  if (activeTab) return activeTab;
  return tabs.find((tab) => isScriptableUrl(tab.url));
}

async function captureScreenshot(tabId?: number): Promise<CaptureScreenshotResponse | null> {
  let targetTabId = tabId;
  if (!targetTabId) {
    const tab = await findWebTab();
    targetTabId = tab?.id;
  }
  if (!targetTabId) return null;

  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'captureScreenshot', tabId: targetTabId }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[VoxSight] captureScreenshot error:', chrome.runtime.lastError.message);
        resolve(null);
        return;
      }
      if (!response) {
        resolve(null);
        return;
      }
      resolve(response as CaptureScreenshotResponse);
    });
  });
}

async function resizeScreenshot(
  dataUrl: string,
  maxWidth: number,
  quality: number,
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.width <= maxWidth) {
        resolve(dataUrl);
        return;
      }
      const scale = maxWidth / img.width;
      const canvas = document.createElement('canvas');
      canvas.width = maxWidth;
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality / 100));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function captureCurrentScreenshotMessage(): Promise<ScreenshotMessage | null> {
  const tab = await findWebTab();
  if (!tab?.id) {
    addStatusMessage('No scriptable webpage found. Open a regular http(s) page.');
    return null;
  }

  const screenshot = await captureScreenshot(tab.id);
  if (!screenshot) {
    return null;
  }

  const resized = await resizeScreenshot(
    screenshot.image,
    SCREENSHOT_CONFIG.maxWidth,
    SCREENSHOT_CONFIG.quality,
  );

  return {
    type: 'screenshot',
    image: resized,
    devicePixelRatio: screenshot.devicePixelRatio,
    viewportWidth: screenshot.viewportWidth,
    viewportHeight: screenshot.viewportHeight,
    url: tab.url || '',
    title: tab.title || '',
  };
}

function isScriptableUrl(url?: string): boolean {
  if (!url) return false;
  if (NON_SCRIPTABLE_URL_PREFIXES.some((prefix) => url.startsWith(prefix))) {
    return false;
  }

  try {
    const parsed = new URL(url);
    if (!['http:', 'https:', 'file:'].includes(parsed.protocol)) {
      return false;
    }
    if (NON_SCRIPTABLE_HOSTS.has(parsed.hostname)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// --- UI Helpers ---

function setProcessingState(label: string): void {
  voiceBtn.classList.add('voice-btn--processing');
  voiceBtnLabel.textContent = label;
}

function clearProcessingState(): void {
  voiceBtn.classList.remove('voice-btn--processing');
  voiceBtnLabel.textContent = 'Hold to speak';
}

function addUserMessage(text: string): void {
  const div = document.createElement('div');
  div.className = 'message message--user';
  div.textContent = text;
  conversation.appendChild(div);
  conversation.scrollTop = conversation.scrollHeight;
}

function addAgentMessage(text: string): void {
  const div = document.createElement('div');
  div.className = 'message message--agent';
  div.textContent = text;
  conversation.appendChild(div);
  conversation.scrollTop = conversation.scrollHeight;
}

function addErrorMessage(text: string): void {
  const div = document.createElement('div');
  div.className = 'message message--error';
  div.textContent = text;
  conversation.appendChild(div);
  conversation.scrollTop = conversation.scrollHeight;
}

function addStatusMessage(text: string): void {
  const div = document.createElement('div');
  div.className = 'message message--status';
  div.textContent = text;
  conversation.appendChild(div);
  conversation.scrollTop = conversation.scrollHeight;
}

// Streaming text: append delta to an in-progress agent message bubble
function appendStreamingDelta(delta: string): void {
  streamingText += delta;
  if (!streamingMessageEl) {
    streamingMessageEl = document.createElement('div');
    streamingMessageEl.className = 'message message--agent message--streaming';
    conversation.appendChild(streamingMessageEl);
  }
  streamingMessageEl.textContent = streamingText;
  pageDescriptionText.textContent = streamingText;
  conversation.scrollTop = conversation.scrollHeight;
}

// Finalize the streaming message: remove streaming class, speak, reset state
function finalizeStreamingMessage(): void {
  if (streamingMessageEl) {
    streamingMessageEl.classList.remove('message--streaming');
    streamingMessageEl = null;
  }
  if (streamingText) {
    speak(streamingText);
    streamingText = '';
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Accessibility ---

let highContrast = false;
let fontSizeMode: FontSizeMode = 'normal';

function applyHighContrast(enabled: boolean): void {
  highContrast = enabled;
  document.body.classList.toggle('high-contrast', enabled);
  contrastBtn.classList.toggle('settings-btn--active', enabled);
}

function cycleFontSize(): void {
  const modes: FontSizeMode[] = ['normal', 'large', 'xlarge'];
  const idx = modes.indexOf(fontSizeMode);
  fontSizeMode = modes[(idx + 1) % modes.length];
  document.body.classList.remove('font-large', 'font-xlarge');
  if (fontSizeMode === 'large') document.body.classList.add('font-large');
  if (fontSizeMode === 'xlarge') document.body.classList.add('font-xlarge');
  fontSizeBtn.textContent = fontSizeMode === 'normal' ? 'A+' : fontSizeMode === 'large' ? 'A++' : 'A';
}

// --- Settings ---

async function loadSettings(): Promise<void> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.settings);
  const settings = (result[STORAGE_KEYS.settings] || {}) as Partial<SidePanelSettings>;
  languageMode = settings.languageMode === 'zh' || settings.languageMode === 'en' || settings.languageMode === 'auto'
    ? settings.languageMode
    : 'auto';
  languageSelect.value = languageMode;
  if (settings.highContrast) applyHighContrast(true);
  if (settings.fontSizeMode === 'large' || settings.fontSizeMode === 'xlarge') {
    fontSizeMode = 'normal'; // cycleFontSize will advance it
    if (settings.fontSizeMode === 'large') cycleFontSize();
    if (settings.fontSizeMode === 'xlarge') { cycleFontSize(); cycleFontSize(); }
  }
}

function persistSettings(): void {
  const settings: SidePanelSettings = { languageMode, highContrast, fontSizeMode };
  chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings });
}

// --- Event Listeners ---

voiceBtn.addEventListener('mousedown', () => startListening());
voiceBtn.addEventListener('mouseup', () => stopListening());
voiceBtn.addEventListener('mouseleave', () => {
  if (isListening) stopListening();
});

document.addEventListener('keydown', (event) => {
  if (event.code === 'Space' && document.activeElement === document.body) {
    event.preventDefault();
    if (!isListening) startListening();
  }
  if (event.code === 'Escape') {
    event.preventDefault();
    if (pendingConfirmation) {
      resolveConfirmation(false);
      return;
    }
    if (isListening) {
      stopListening();
      return;
    }
    synthesis.cancel();
    clearBackendTimeout();
    clearProcessingState();
  }
});

document.addEventListener('keyup', (event) => {
  if (event.code === 'Space' && isListening) {
    event.preventDefault();
    stopListening();
  }
});

// Listen for shortcut messages from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'describePage') {
    void handleUserInput('Describe this page');
  }
});

textInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && textInput.value.trim()) {
    const value = textInput.value.trim();
    textInput.value = '';
    if (pendingConfirmation) {
      handleConfirmationSpeech(value);
      return;
    }
    void handleUserInput(value);
  }
});

describeBtn.addEventListener('click', () => void handleUserInput('Describe this page'));
readBtn.addEventListener('click', () => void handleUserInput('Read the main content'));

confirmYesBtn.addEventListener('click', () => resolveConfirmation(true));
confirmNoBtn.addEventListener('click', () => resolveConfirmation(false));

contrastBtn.addEventListener('click', () => {
  applyHighContrast(!highContrast);
  persistSettings();
});

fontSizeBtn.addEventListener('click', () => {
  cycleFontSize();
  persistSettings();
});

languageSelect.addEventListener('change', () => {
  const selected = languageSelect.value;
  languageMode = selected === 'zh' || selected === 'en' || selected === 'auto' ? selected : 'auto';
  applyRecognitionLanguage();
  persistSettings();
  const msg = languageMode === 'zh' ? '语言已切换为中文。' : languageMode === 'en' ? 'Language switched to English.' : 'Language switched to auto.';
  addStatusMessage(msg);
});

// --- Auto Page Description ---

let lastDescribedTabId: number | null = null;
let lastDescribedUrl: string | null = null;

function autoDescribePage(tabId: number, url: string): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (tabId === lastDescribedTabId && url === lastDescribedUrl) return;
  if (!isScriptableUrl(url)) return;

  lastDescribedTabId = tabId;
  lastDescribedUrl = url;

  const summaryLabel = languageMode === 'zh' ? '正在分析新页面...' : 'Analyzing new page...';
  pageDescriptionText.textContent = summaryLabel;
}

function setupTabListeners(): void {
  chrome.tabs.onActivated.addListener((activeInfo) => {
    chrome.tabs.get(activeInfo.tabId, (tab) => {
      if (tab?.url) autoDescribePage(activeInfo.tabId, tab.url);
    });
  });

  chrome.webNavigation?.onCompleted.addListener((details) => {
    if (details.frameId !== 0) return;
    autoDescribePage(details.tabId, details.url);
  });
}

// --- Network Status ---

function setupNetworkListeners(): void {
  const updateOnlineStatus = () => {
    if (!navigator.onLine) {
      voiceBtn.disabled = true;
      voiceBtn.classList.add('voice-btn--disabled');
      addStatusMessage(languageMode === 'zh' ? '网络已断开，请检查连接。' : 'Network offline. Please check your connection.');
    } else {
      voiceBtn.disabled = false;
      voiceBtn.classList.remove('voice-btn--disabled');
      addStatusMessage(languageMode === 'zh' ? '网络已恢复。' : 'Network restored.');
    }
  };

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  // Check initial state
  if (!navigator.onLine) {
    voiceBtn.disabled = true;
    voiceBtn.classList.add('voice-btn--disabled');
  }
}

// --- Init ---

async function init(): Promise<void> {
  await loadSettings();
  initSpeechRecognition();
  setupTabListeners();
  setupNetworkListeners();
  void connectWebSocket();

  const result = await chrome.storage.local.get(STORAGE_KEYS.onboardingComplete);
  if (!result[STORAGE_KEYS.onboardingComplete]) {
    const text = 'Welcome to VoxSight! Hold the microphone button or press Space to give a voice command.';
    addAgentMessage(text);
    speak(text);
    chrome.storage.local.set({ [STORAGE_KEYS.onboardingComplete]: true });
  }
}

void init();
