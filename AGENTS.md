# Repository Guidelines

## Project Structure & Module Organization
This is a Manifest V3 Chrome extension with no build system.
- `manifest.json`: extension config, permissions, OAuth client settings.
- `background.js`: service worker orchestration (recording state, messaging, uploads).
- `offscreen/`: recorder runtime (`recorder.html`, `recorder.js`) for MV3 media capture.
- `content/`: in-tab recording overlay UI (`overlay.js`, `overlay.css`, `controls.html`).
- `popup/`: popup UI and interactions (`popup.html`, `popup.js`, `popup-recordings.js`, `style.css`).
- `utils/`: shared helpers (Drive API, storage, thumbnails).
- `icons/`: extension assets.

## Build, Test, and Development Commands
No compile step required; development is reload-based.
- `node --check background.js`: quick syntax validation for a file.
- `rg --files -g '*.js' | xargs -I{} node --check '{}'`: syntax-check all JS files.
- `git status` and `git diff --stat`: review local changes before commit.
- Chrome dev loop: open `chrome://extensions` -> **Load unpacked** (first time) -> **Reload** after edits.

## Coding Style & Naming Conventions
- Use plain JavaScript (ES modules are not used here).
- Indentation: 2 spaces; keep semicolon usage consistent with surrounding file.
- Prefer descriptive camelCase for variables/functions (`startRecordingFlow`, `uploadProgress`).
- Keep message/action names explicit and uppercase when used as event constants (example: `START_RECORDING`).
- Keep modules focused: UI logic in `popup/`, capture pipeline in `offscreen/`, orchestration in `background.js`.

## Testing Guidelines
There is no formal automated test suite yet.
- Minimum check before PR: run full JS syntax check and manually verify one recording flow.
- Manual smoke test:
  1. Connect Google Drive in popup.
  2. Start recording in one mode (`screen-only` or `camera-only`).
  3. Stop recording and confirm upload success + share link.
- Validate Service Worker logs in extension DevTools for runtime errors.