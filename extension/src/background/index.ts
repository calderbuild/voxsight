import { SCREENSHOT_CONFIG } from '../shared/constants';
import type { CaptureScreenshotResponse } from '../shared/types';

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
});

// Handle messages from side panel and content scripts
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'captureScreenshot') {
    captureScreenshot().then(sendResponse).catch(() => sendResponse(null));
    return true; // async response
  }
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'describe-page') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.sidePanel.open({ tabId: tab.id });
      // Send describe command to side panel
      chrome.runtime.sendMessage({ action: 'describePage' });
    }
  }
});

async function captureScreenshot(): Promise<CaptureScreenshotResponse | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return null;

    const dataUrl = await chrome.tabs.captureVisibleTab({
      format: SCREENSHOT_CONFIG.format,
      quality: SCREENSHOT_CONFIG.quality,
    });

    // Get viewport dimensions from the tab
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        devicePixelRatio: window.devicePixelRatio,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      }),
    });

    const info = result?.result || {
      devicePixelRatio: 1,
      viewportWidth: 1280,
      viewportHeight: 720,
    };

    return {
      image: dataUrl,
      devicePixelRatio: info.devicePixelRatio,
      viewportWidth: info.viewportWidth,
      viewportHeight: info.viewportHeight,
    };
  } catch (err) {
    console.error('Screenshot capture failed:', err);
    return null;
  }
}
