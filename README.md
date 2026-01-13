# Loom Clone Chrome Extension

A Chrome extension that clones Loom functionality, allowing you to record your screen with a camera bubble overlay and automatically upload videos to Google Drive.

## Features

### Recording Modes
- 🎥 **Screen + Camera**: Record your screen with camera bubble overlay
- 🖥️ **Screen Only**: Record just your screen without camera
- 📹 **Camera Only**: Record just your camera feed

### Recording Controls
- ⏸️ **Pause/Resume**: Pause and resume your recording anytime
- ⏱️ **Live Timer**: See recording duration in real-time
- 🎯 **Visual Indicators**: Clear recording status with animated indicators
- 🎨 **Draggable Camera Bubble**: Reposition camera anywhere on screen

### Audio & Video
- 🎤 Microphone and system audio capture
- 🔊 Multi-track audio mixing
- 📺 HD video quality (up to 1080p)

### Storage & Sharing
- 📁 Automatic upload to Google Drive
- 🔗 Shareable links copied to clipboard
- 📊 Real-time upload progress
- ✅ Success animations and feedback

### User Interface
- 🎨 Modern Loom-inspired design
- 🌈 Smooth animations and transitions
- 📱 Responsive and intuitive controls
- 🎯 Beautiful visual feedback

## Setup Instructions

### 1. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Google Drive API**:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google Drive API" and enable it
4. Create OAuth 2.0 Credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Choose "Chrome Extension" as the application type
   - Add your extension ID (you'll get this after loading the extension)
   - Copy the Client ID

### 2. Configure Extension

1. Open `manifest.json`
2. Replace `YOUR_GOOGLE_CLOUD_CLIENT_ID.apps.googleusercontent.com` with your actual Client ID from step 1

### 3. Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `my-loom-clone` directory
5. Copy the Extension ID shown on the extensions page
6. Go back to Google Cloud Console and add this Extension ID to your OAuth client credentials

### 4. Create Icon Files (Optional)

Create an `images` directory and add icon files:
- `icon16.png` (16x16 pixels)
- `icon48.png` (48x48 pixels)
- `icon128.png` (128x128 pixels)

Or remove the icon references from `manifest.json` if you don't have icons yet.

## Usage

1. **First Time Setup:**
   - Click the extension icon
   - Click "Connect Google Drive"
   - Authorize the extension in the popup window

2. **Record a Video:**
   - Click the extension icon
   - Choose your recording mode:
     - **Screen + Camera** (default)
     - **Screen Only** 
     - **Camera Only**
   - Click "Start Recording"
   - Select what to share (screen, window, or tab) in Chrome's share dialog
   - Allow microphone access when prompted
   - The recording interface will appear:
     - Camera bubble (if enabled) - drag to reposition
     - Controls bar with pause/resume and stop buttons
     - Live recording timer
   - Click "Pause" to pause recording (click again to resume)
   - Click "Stop" when done

3. **Share:**
   - The video will automatically upload to Google Drive
   - A shareable link will be copied to your clipboard
   - Paste it wherever you want to share!

## File Structure

```
my-loom-clone/
├── manifest.json          # Extension configuration
├── background.js          # Service worker (auth & orchestration)
├── popup/                 # Extension popup UI
│   ├── popup.html
│   ├── popup.js
│   └── style.css
├── content/               # Content script overlay
│   ├── overlay.js
│   ├── overlay.css
│   └── controls.html
├── offscreen/             # Recording engine
│   ├── recorder.html
│   └── recorder.js
└── utils/                 # Utilities
    └── drive-api.js       # Google Drive API helpers
```

## Technical Details

- **Manifest V3** compliant
- Uses **Offscreen Document** for recording (required for MV3)
- **Shadow DOM** for UI isolation
- **OAuth2** via Chrome Identity API
- **MediaRecorder API** for video capture
- **Google Drive API** for storage

## Permissions

- `activeTab` - Access current tab for overlay injection
- `scripting` - Inject content scripts
- `storage` - Store authentication status
- `identity` - OAuth2 authentication
- `offscreen` - Create offscreen document for recording
- `notifications` - Show upload status
- `tabs` - Access tab information

## Troubleshooting

- **"Not authenticated" error**: Make sure you've completed the OAuth setup and added your Extension ID to Google Cloud Console
- **Camera not showing**: Check browser permissions for camera access
- **Recording not starting**: Ensure you've selected a screen/window/tab in Chrome's share dialog
- **Upload fails**: Check your internet connection and ensure Google Drive API is enabled

## License

MIT

