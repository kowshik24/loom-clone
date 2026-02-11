# Drive Loom Clone 📹

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Chrome](https://img.shields.io/badge/platform-Chrome_Extension-orange)

**Professional screen recording, directly in your browser.**

Drive Loom Clone is a privacy-focused Chrome Extension that emulates the core functionality of Loom. It records your screen and camera, then automatically uploads the video to your **personal Google Drive**. No third-party servers, no subscriptions, and complete control over your data.

---

## 🚀 Key Features

*   **Privacy-First Architecture**: Videos travel directly from your browser to your Google Drive. We never see your content.
*   **Flexible Recording Modes**:
    *   **Screen + Camera**: Perfect for tutorials and presentations.
    *   **Screen Only**: Ideal for technical walkthroughs.
    *   **Camera Only**: Great for personal messages.
*   **Professional Overlay**: Features a draggable, circular camera bubble and a non-intrusive control bar.
*   **Instant Sharing**: A shareable Drive link is copied to your clipboard immediately after upload.
*   **Smart Storage**: Utilizes `resumable uploads` for reliability, even with large files.

## �️ Installation & Setup

Since this extension interacts with your personal Google Drive, a one-time setup is required to authorize the application.

### Prerequisites
*   Google Chrome (or Chromium-based browser)
*   A Google Cloud Project

### Step 1: Google Cloud Configuration
1.  Navigate to the [Google Cloud Console](https://console.cloud.google.com/).
2.  Create a new project (e.g., "My Recorder").
3.  **Enable API**: Search for and enable the **Google Drive API**.
4.  **Create Credentials**:
    *   Go to **APIs & Services > Credentials**.
    *   Click **Create Credentials > OAuth client ID**.
    *   Select **Chrome Extension** as the application type.
    *   *Keep this tab open; you will need to paste your Extension ID here in Step 3.*

### Step 2: Local Configuration
1.  Open the `manifest.json` file in this repository.
2.  Locate the `"oauth2"` section.
3.  Replace the `client_id` value with the **Client ID** generated in Step 1.

### Step 3: Load Extension
1.  Open Chrome and go to `chrome://extensions/`.
2.  Enable **Developer mode** (toggle in the top-right corner).
3.  Click **Load unpacked** and select the extension directory.
4.  **Crucial Step**: Copy the generated **Extension ID** (e.g., `abcdef...`) from the extensions page.
5.  Return to the Google Cloud Console and add this ID to your OAuth Client configuration under **Item ID**.

## 💻 Tech Stack

Built with modern web standards for performance and maintainability.

*   **Manifest V3**: Future-proof extension architecture.
*   **Offscreen Documents**: Handles media processing without impacting browser performance.
*   **Shadow DOM**: Ensures the recording overlay interacts consistently with any website.
*   **Google Drive API v3**: Robust, resumable file uploads.

## 🔒 Privacy & Security

This project is open-source and designed with privacy as the core tenet.
*   **No Tracking**: No analytics or tracking scripts.
*   **Direct Upload**: Data flows only between your client and Google's servers.
*   **Local Processing**: Thumbnail generation and blob processing happen locally on your device.

---

*This project is for educational purposes and personal use.*
