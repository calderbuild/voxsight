import type { AgentAction, ExecuteActionResponse } from '../shared/types';

// Listen for action commands from side panel via background
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'executeAction') {
    executeAction(message.agentAction as AgentAction)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, description: err.message }));
    return true;
  }
});

async function executeAction(action: AgentAction): Promise<ExecuteActionResponse> {
  switch (action.type) {
    case 'click':
      return executeClick(action.x, action.y, action.description);
    case 'type_text':
      return executeTypeText(action.x, action.y, action.text);
    case 'scroll':
      return executeScroll(action.direction, action.amount);
    case 'navigate':
      return executeNavigate(action.url);
    case 'hover':
      return executeHover(action.x, action.y);
    case 'press_key':
      return executePressKey(action.key);
    case 'describe_page':
    case 'find_element':
    case 'read_content':
      // These are handled by the backend/Gemini, not the content script
      return { success: true, description: 'Handled by AI agent' };
    default:
      return { success: false, description: `Unknown action: ${(action as AgentAction).type}` };
  }
}

function executeClick(imgX: number, imgY: number, description: string): ExecuteActionResponse {
  const dpr = window.devicePixelRatio || 1;
  const cssX = imgX / dpr;
  const cssY = imgY / dpr;

  // Highlight before clicking
  highlightPosition(cssX, cssY, description);

  // Find element at coordinates
  const element = document.elementFromPoint(cssX, cssY);

  if (element && element instanceof HTMLElement) {
    element.focus();
    element.click();
    removeHighlight();
    return { success: true, description: `Clicked: ${description}` };
  }

  // Fallback: dispatch mouse events at coordinates
  const clickEvent = new MouseEvent('click', {
    clientX: cssX,
    clientY: cssY,
    bubbles: true,
    cancelable: true,
  });
  document.elementFromPoint(cssX, cssY)?.dispatchEvent(clickEvent);
  removeHighlight();
  return { success: true, description: `Clicked at (${Math.round(cssX)}, ${Math.round(cssY)})` };
}

function executeTypeText(imgX: number, imgY: number, text: string): ExecuteActionResponse {
  const dpr = window.devicePixelRatio || 1;
  const cssX = imgX / dpr;
  const cssY = imgY / dpr;

  const element = document.elementFromPoint(cssX, cssY);

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.focus();
    element.value = '';

    // Use InputEvent for framework compatibility
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype,
      'value'
    )?.set;

    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(element, text);
    } else {
      element.value = text;
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));

    return { success: true, description: `Typed "${text}"` };
  }

  // Try contentEditable
  if (element instanceof HTMLElement && element.isContentEditable) {
    element.focus();
    element.textContent = text;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    return { success: true, description: `Typed "${text}" in editable` };
  }

  return { success: false, description: 'No input element found at coordinates' };
}

function executeScroll(direction: string, amount: number): ExecuteActionResponse {
  const pixels = amount || 300;
  switch (direction) {
    case 'down':
      window.scrollBy({ top: pixels, behavior: 'smooth' });
      break;
    case 'up':
      window.scrollBy({ top: -pixels, behavior: 'smooth' });
      break;
    case 'left':
      window.scrollBy({ left: -pixels, behavior: 'smooth' });
      break;
    case 'right':
      window.scrollBy({ left: pixels, behavior: 'smooth' });
      break;
  }
  return { success: true, description: `Scrolled ${direction} ${pixels}px` };
}

function executeNavigate(url: string): ExecuteActionResponse {
  window.location.href = url;
  return { success: true, description: `Navigating to ${url}` };
}

function executeHover(imgX: number, imgY: number): ExecuteActionResponse {
  const dpr = window.devicePixelRatio || 1;
  const cssX = imgX / dpr;
  const cssY = imgY / dpr;

  const element = document.elementFromPoint(cssX, cssY);
  if (element) {
    element.dispatchEvent(new MouseEvent('mouseenter', { clientX: cssX, clientY: cssY, bubbles: true }));
    element.dispatchEvent(new MouseEvent('mouseover', { clientX: cssX, clientY: cssY, bubbles: true }));
    return { success: true, description: 'Hovered' };
  }
  return { success: false, description: 'No element at coordinates' };
}

function executePressKey(key: string): ExecuteActionResponse {
  const active = document.activeElement || document.body;
  active.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  active.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));

  if (key === 'Enter') {
    active.dispatchEvent(new KeyboardEvent('keypress', { key, bubbles: true }));
  }

  return { success: true, description: `Pressed ${key}` };
}

// --- Visual Highlight ---

let highlightOverlay: HTMLDivElement | null = null;
let highlightLabel: HTMLDivElement | null = null;

function highlightPosition(x: number, y: number, label: string): void {
  removeHighlight();

  highlightOverlay = document.createElement('div');
  highlightOverlay.className = 'voxsight-highlight-cursor';
  highlightOverlay.style.left = `${x - 15}px`;
  highlightOverlay.style.top = `${y - 15}px`;
  document.body.appendChild(highlightOverlay);

  if (label) {
    highlightLabel = document.createElement('div');
    highlightLabel.className = 'voxsight-label';
    highlightLabel.textContent = label;
    highlightLabel.style.left = `${x}px`;
    highlightLabel.style.top = `${y - 35}px`;
    document.body.appendChild(highlightLabel);
  }

  // Auto-remove after 2 seconds
  setTimeout(removeHighlight, 2000);
}

function removeHighlight(): void {
  highlightOverlay?.remove();
  highlightOverlay = null;
  highlightLabel?.remove();
  highlightLabel = null;
}

// Also highlight elements found by AI
export function highlightElement(element: HTMLElement, label: string): void {
  removeHighlight();
  element.classList.add('voxsight-highlight');

  highlightLabel = document.createElement('div');
  highlightLabel.className = 'voxsight-label';
  highlightLabel.textContent = label;

  const rect = element.getBoundingClientRect();
  highlightLabel.style.left = `${rect.left + window.scrollX}px`;
  highlightLabel.style.top = `${rect.top + window.scrollY - 28}px`;
  document.body.appendChild(highlightLabel);

  setTimeout(() => {
    element.classList.remove('voxsight-highlight');
    highlightLabel?.remove();
    highlightLabel = null;
  }, 3000);
}
