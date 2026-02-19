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
  UserCommandMessage,
  WSMessage,
} from '../shared/types';
import { BACKEND_URL, STORAGE_KEYS } from '../shared/constants';
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

// State
let ws: WebSocket | null = null;
let isListening = false;
let recognition: SpeechRecognition | null = null;
let synthesis = window.speechSynthesis;
let languageMode: LanguageMode = 'auto';
let backendTimeoutId: number | null = null;
let waitingForConnectionRecovery = false;

interface PendingConfirmation {
  action: AgentAction;
  resolve: (approved: boolean) => void;
}

let pendingConfirmation: PendingConfirmation | null = null;

interface SidePanelSettings {
  languageMode: LanguageMode;
}

const BACKEND_TIMEOUT_MS = 10_000;
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
    case 'connected':
      addStatusMessage(`Session: ${(msg as ConnectedMessage).sessionId}`);
      return;

    case 'agent_response': {
      clearBackendTimeout();
      const response = msg as AgentResponseMessage;
      pageDescriptionText.textContent = response.text;
      addAgentMessage(response.text);
      speak(response.text);
      await processAgentActions(response.actions);
      if (response.actions.length === 0) {
        clearProcessingState();
      }
      return;
    }

    case 'error':
      clearBackendTimeout();
      addErrorMessage((msg as ErrorMessage).message);
      clearProcessingState();
      return;
  }
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

  return {
    type: 'screenshot',
    image: screenshot.image,
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Settings ---

async function loadSettings(): Promise<void> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.settings);
  const settings = (result[STORAGE_KEYS.settings] || {}) as Partial<SidePanelSettings>;
  languageMode = settings.languageMode === 'zh' || settings.languageMode === 'en' || settings.languageMode === 'auto'
    ? settings.languageMode
    : 'auto';
  languageSelect.value = languageMode;
}

function persistSettings(): void {
  const settings: SidePanelSettings = { languageMode };
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
});

document.addEventListener('keyup', (event) => {
  if (event.code === 'Space' && isListening) {
    event.preventDefault();
    stopListening();
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

languageSelect.addEventListener('change', () => {
  const selected = languageSelect.value;
  languageMode = selected === 'zh' || selected === 'en' || selected === 'auto' ? selected : 'auto';
  applyRecognitionLanguage();
  persistSettings();
  const msg = languageMode === 'zh' ? '语言已切换为中文。' : languageMode === 'en' ? 'Language switched to English.' : 'Language switched to auto.';
  addStatusMessage(msg);
});

// --- Init ---

async function init(): Promise<void> {
  await loadSettings();
  initSpeechRecognition();
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
