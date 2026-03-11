# Loom Clone (Chrome Extension)

A Manifest V3 Chrome extension for recording screen/camera sessions and uploading the resulting video directly to Google Drive.

## Highlights

- Recording modes:
  - `screen-camera`
  - `screen-only`
  - `camera-only`
- Offscreen recording engine (`offscreen/recorder.js`) for stable capture in MV3.
- Overlay controls (pause/resume/stop) injected into the active tab.
- Google OAuth via `chrome.identity` and upload to Drive via Drive v3 API.
- Upload progress, notifications, clipboard copy, and local recording history.

## Architecture

### Runtime flow

1. Popup sends `START_RECORDING` to the background service worker.
2. Background creates/uses the offscreen document and starts capture.
3. Offscreen recorder produces the media blob and sends `VIDEO_BLOB`.
4. Background uploads to Drive and broadcasts progress/events back to popup.
5. Popup updates UI and stores/share link state.

### Core modules

- `manifest.json`: extension configuration, permissions, OAuth settings.
- `background.js`: orchestration, auth, upload pipeline, notifications.
- `offscreen/recorder.js`: media capture, pause/resume/stop, blob transfer.
- `content/overlay.js`: recording controls and timer in page context.
- `popup/popup.js`: authentication and recording state UI.
- `utils/drive-api.js`: Drive folder handling + resumable upload.
- `utils/storage.js`: recording history and upload state storage helpers.

## Prerequisites

- Google Chrome (latest stable recommended).
- A Google Cloud project with Drive API enabled.
- OAuth client created for a **Chrome Extension**.

## Setup

### 1. Configure Google Cloud

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Enable **Google Drive API** for your project.
3. Configure OAuth consent screen with required scopes.
4. Create OAuth credentials with application type **Chrome Extension**.
5. Keep the generated client ID.

### 2. Configure extension OAuth

1. Open `manifest.json`.
2. Replace:
   - `YOUR_CLIENT_ID.apps.googleusercontent.com`
3. Save the file.

### 3. Load unpacked extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this repository folder.
4. Copy the extension ID from Chrome extensions page.
5. In Google Cloud OAuth client settings, add that extension ID to the Chrome Extension client configuration.

## Usage

1. Open the extension popup.
2. Click **Connect with Google Drive** and complete OAuth.
3. Select a recording mode.
4. Click **Start Recording**.
5. Use overlay controls to pause/resume/stop.
6. After stop, wait for upload completion and use the Drive link.

## Permissions (why they exist)

- `activeTab`: target current tab for overlay interactions.
- `scripting`: inject/remove overlay scripts and styles.
- `storage`: persist auth flags, upload state, and recording history.
- `identity`: OAuth token acquisition for Google APIs.
- `offscreen`: host recorder document required by MV3 architecture.
- `notifications`: upload completion/failure notifications.
- `tabs`: active tab lookup and link-opening behaviors.
- `desktopCapture`: screen/window/tab capture selection.

## Development Notes

- This project is plain JavaScript and does not require a build step.
- After code changes, reload the unpacked extension from `chrome://extensions`.
- Background/service worker logs are available from the extension’s **Service worker** inspector.
- Offscreen recorder logs are available under extension-internal pages in DevTools.

## Troubleshooting

### OAuth fails or user appears unauthenticated

- Confirm `manifest.json` has the correct OAuth client ID.
- Verify OAuth consent screen is configured and your account is authorized (if app is in testing mode).
- Reopen popup and retry **Connect with Google Drive**.

### Recording does not start

- For `screen-camera` and `screen-only`, ensure screen sharing is accepted in Chrome’s picker.
- Verify extension has microphone/camera permission where applicable.

### Upload fails

- Confirm Drive API is enabled in the same Google Cloud project as OAuth.
- Inspect service worker logs for Drive API response details.

## Repository Layout

```text
.
├── manifest.json
├── background.js
├── content/
│   ├── overlay.js
│   ├── overlay.css
│   └── controls.html
├── offscreen/
│   ├── recorder.html
│   └── recorder.js
├── popup/
│   ├── popup.html
│   ├── popup.js
│   ├── popup-recordings.js
│   └── style.css
└── utils/
    ├── drive-api.js
    ├── storage.js
    └── thumbnail.js
```

## License

MIT
