import { SCREENSHOT_CONFIG } from '../shared/constants';
import type { CaptureScreenshotResponse } from '../shared/types';

const NON_SCRIPTABLE_URL_PREFIXES = ['chrome://', 'chrome-extension://', 'about:', 'edge://', 'devtools://', 'view-source:'];
const NON_SCRIPTABLE_HOSTS = new Set(['chrome.google.com', 'chromewebstore.google.com']);

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
});

// Handle messages from side panel and content scripts
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'captureScreenshot') {
    const tabId = message.tabId as number | undefined;
    captureScreenshot(tabId)
      .then((result) => {
        console.log('[VoxSight] Screenshot captured:', result ? 'OK' : 'null');
        sendResponse(result);
      })
      .catch((err) => {
        console.error('[VoxSight] Screenshot error:', err);
        sendResponse(null);
      });
    return true; // async response
  }
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'describe-page') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.sidePanel.open({ tabId: tab.id });
      chrome.runtime.sendMessage({ action: 'describePage' });
    }
  }
});

async function captureScreenshot(tabId?: number): Promise<CaptureScreenshotResponse | null> {
  try {
    // Use provided tabId or find active tab
    let targetTabId = tabId;
    if (!targetTabId) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      targetTabId = tab?.id;
    }
    if (!targetTabId) return null;

    // Get the tab info and ensure it's the active (visible) tab in its window
    const tab = await chrome.tabs.get(targetTabId);
    if (!tab.windowId) return null;

    // Activate the target tab so captureVisibleTab captures it (not a chrome:// tab)
    if (!tab.active) {
      await chrome.tabs.update(targetTabId, { active: true });
      // Brief delay to let Chrome render the activated tab
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: SCREENSHOT_CONFIG.format,
      quality: SCREENSHOT_CONFIG.quality,
    });

    let info: CaptureScreenshotResponse = {
      image: dataUrl,
      devicePixelRatio: 1,
      viewportWidth: tab.width || 1280,
      viewportHeight: tab.height || 720,
    };

    // Some hosts (for example Chrome Web Store) block script injection even with host permissions.
    if (isScriptableUrl(tab.url)) {
      try {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: targetTabId },
          func: () => ({
            devicePixelRatio: window.devicePixelRatio,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
          }),
        });

        if (result?.result) {
          info = {
            image: dataUrl,
            devicePixelRatio: result.result.devicePixelRatio,
            viewportWidth: result.result.viewportWidth,
            viewportHeight: result.result.viewportHeight,
          };
        }
      } catch (err) {
        console.warn('[VoxSight] Could not read viewport via executeScript, using fallback:', (err as Error).message);
      }
    } else {
      console.warn('[VoxSight] Restricted tab URL, using fallback viewport values:', tab.url);
    }

    return info;
  } catch (err) {
    console.error('[VoxSight] Screenshot capture failed:', err, 'message:', (err as Error).message);
    return null;
  }
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
