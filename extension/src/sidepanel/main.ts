import type {
  AgentAction,
  AgentResponseMessage,
  CaptureScreenshotResponse,
  ErrorMessage,
  ConnectedMessage,
  UserCommandMessage,
  WSMessage,
} from '../shared/types';
import { BACKEND_URL, STORAGE_KEYS } from '../shared/constants';

// DOM elements
const pageDescription = document.getElementById('pageDescription') as HTMLElement;
const conversation = document.getElementById('conversation') as HTMLElement;
const voiceBtn = document.getElementById('voiceBtn') as HTMLButtonElement;
const voiceBtnLabel = voiceBtn.querySelector('.voice-btn__label') as HTMLSpanElement;
const textInput = document.getElementById('textInput') as HTMLInputElement;
const describeBtn = document.getElementById('describeBtn') as HTMLButtonElement;
const readBtn = document.getElementById('readBtn') as HTMLButtonElement;

// State
let ws: WebSocket | null = null;
let isListening = false;
let recognition: SpeechRecognition | null = null;
let synthesis = window.speechSynthesis;

// --- WebSocket ---

function connectWebSocket(): void {
  ws = new WebSocket(BACKEND_URL);

  ws.onopen = () => {
    addStatusMessage('Connected to VoxSight backend');
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data) as WSMessage;
    handleServerMessage(msg);
  };

  ws.onerror = () => {
    addStatusMessage('Connection error. Retrying...');
  };

  ws.onclose = () => {
    addStatusMessage('Disconnected. Reconnecting...');
    setTimeout(connectWebSocket, 3000);
  };
}

function sendMessage(msg: WSMessage): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function handleServerMessage(msg: WSMessage): void {
  switch (msg.type) {
    case 'connected':
      addStatusMessage(`Session: ${(msg as ConnectedMessage).sessionId}`);
      break;

    case 'agent_response': {
      const response = msg as AgentResponseMessage;
      addAgentMessage(response.text);
      speak(response.text);

      // Forward actions to content script
      for (const action of response.actions) {
        executeAction(action);
      }
      break;
    }

    case 'error':
      addErrorMessage((msg as ErrorMessage).message);
      break;
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
  recognition.lang = 'zh-CN';

  recognition.onresult = (event) => {
    const result = event.results[0];
    if (result.isFinal) {
      const text = result[0].transcript;
      const confidence = result[0].confidence;

      if (confidence < 0.5) {
        addAgentMessage('Sorry, I did not catch that. Please try again.');
        speak('Sorry, I did not catch that. Please try again.');
        return;
      }

      handleUserInput(text);
    }
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
  voiceBtnLabel.textContent = 'Hold to speak';
  try { recognition.stop(); } catch {}
}

function showTextInput(): void {
  textInput.style.display = 'block';
  voiceBtn.style.display = 'none';
}

// --- Voice Output ---

function speak(text: string): void {
  synthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-CN';
  utterance.rate = 1.0;
  synthesis.speak(utterance);
}

// --- Actions ---

async function handleUserInput(text: string): Promise<void> {
  addUserMessage(text);

  // Capture screenshot first
  const screenshot = await captureScreenshot();
  if (!screenshot) {
    addErrorMessage('Failed to capture screenshot. Make sure you are on a regular webpage (not chrome:// or about: pages).');
    voiceBtn.classList.remove('voice-btn--processing');
    voiceBtnLabel.textContent = 'Hold to speak';
    return;
  }

  const tab = await getCurrentTab();
  const msg: UserCommandMessage = {
    type: 'user_command',
    text,
    screenshot: {
      type: 'screenshot',
      image: screenshot.image,
      devicePixelRatio: screenshot.devicePixelRatio,
      viewportWidth: screenshot.viewportWidth,
      viewportHeight: screenshot.viewportHeight,
      url: tab?.url || '',
      title: tab?.title || '',
    },
  };

  sendMessage(msg);
  voiceBtn.classList.add('voice-btn--processing');
  voiceBtnLabel.textContent = 'Analyzing...';
}

async function captureScreenshot(): Promise<CaptureScreenshotResponse | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'captureScreenshot' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        resolve(null);
        return;
      }
      resolve(response as CaptureScreenshotResponse);
    });
  });
}

async function getCurrentTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function executeAction(action: AgentAction): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  chrome.tabs.sendMessage(tab.id, { action: 'executeAction', agentAction: action });

  // Reset button state
  voiceBtn.classList.remove('voice-btn--processing');
  voiceBtnLabel.textContent = 'Hold to speak';
}

// --- UI Helpers ---

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

// --- Event Listeners ---

// Push-to-talk: hold to speak
voiceBtn.addEventListener('mousedown', () => startListening());
voiceBtn.addEventListener('mouseup', () => stopListening());
voiceBtn.addEventListener('mouseleave', () => {
  if (isListening) stopListening();
});

// Keyboard: Space to speak (when side panel focused)
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && document.activeElement === document.body) {
    e.preventDefault();
    if (!isListening) startListening();
  }
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'Space' && isListening) {
    e.preventDefault();
    stopListening();
  }
});

// Text input fallback
textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && textInput.value.trim()) {
    handleUserInput(textInput.value.trim());
    textInput.value = '';
  }
});

// Quick actions
describeBtn.addEventListener('click', () => {
  handleUserInput('Describe this page');
});

readBtn.addEventListener('click', () => {
  handleUserInput('Read the main content');
});

// --- Init ---

function init(): void {
  initSpeechRecognition();
  connectWebSocket();

  // Check onboarding
  chrome.storage.local.get(STORAGE_KEYS.onboardingComplete, (result) => {
    if (!result[STORAGE_KEYS.onboardingComplete]) {
      addAgentMessage('Welcome to VoxSight! Hold the microphone button or press Space to give a voice command. Press Alt+D to hear a page description.');
      speak('Welcome to VoxSight. Hold Space to speak, or press Alt D to describe the current page.');
      chrome.storage.local.set({ [STORAGE_KEYS.onboardingComplete]: true });
    }
  });
}

init();
