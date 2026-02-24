# VoxSight Privacy Policy

Last updated: 2026-02-24

## What data VoxSight collects

VoxSight captures screenshots of the active browser tab when you issue a voice command. These screenshots are used solely to analyze the page content and determine what actions to perform.

## How data is used

- Screenshots are sent to the VoxSight backend server (hosted on Google Cloud Run) for processing
- The backend forwards screenshots to the Gemini API for multimodal analysis
- Voice input is processed locally using the Web Speech API; audio is not sent to VoxSight servers
- No screenshots or conversation data are stored on the server; all data is held in memory only for the duration of the active session

## What data is NOT collected

- VoxSight does not collect browsing history
- VoxSight does not collect passwords or form data (beyond what is visible in screenshots during active use)
- VoxSight does not track users across websites
- VoxSight does not use cookies or analytics trackers
- VoxSight does not share data with third parties (beyond Google's Gemini API for processing)

## Data retention

- Session data (screenshots, conversation history) is deleted when the WebSocket connection closes
- No data is persisted to disk on the server
- Local extension settings (language preference, accessibility settings) are stored in Chrome's local storage on your device

## Third-party services

- **Google Gemini API**: Screenshots are sent to Google's Gemini API for analysis. See [Google's AI Privacy Policy](https://ai.google.dev/terms).
- **Google Cloud Run**: The backend server runs on Google Cloud Run. See [Google Cloud Privacy](https://cloud.google.com/terms/cloud-privacy-notice).

## Permissions

VoxSight requests the following Chrome permissions:
- `activeTab`: To capture screenshots of the current tab
- `sidePanel`: To display the VoxSight interface
- `tabs`: To identify and manage browser tabs
- `scripting`: To execute actions on web pages
- `storage`: To save user preferences locally
- `webNavigation`: To detect page navigation for automatic descriptions

## Contact

For questions about this privacy policy, please open an issue on the [GitHub repository](https://github.com/calderbuild/voxsight).
