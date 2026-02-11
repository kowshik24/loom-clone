// Background Service Worker - The "Brain" of the extension
// Handles authentication, orchestration, and communication

importScripts('utils/drive-api.js');
importScripts('utils/thumbnail.js');
importScripts('utils/storage.js');

// Helper to get auth token
const getAuthToken = (interactive = false) => {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        const error = chrome.runtime.lastError;
        // Extract the actual error message - chrome.runtime.lastError has a message property
        const errorMessage = error.message || 'Authentication failed';
        console.error('getAuthToken error message:', errorMessage);
        // Log the full error for debugging
        try {
          console.error('Full error details:', {
            message: error.message,
            toString: String(error)
          });
        } catch (e) {
          // Ignore JSON stringify errors
        }

        // Provide more helpful error messages
        let userFriendlyMessage = errorMessage;
        if (errorMessage.includes('bad client id') || errorMessage.includes('bad client')) {
          userFriendlyMessage = 'OAuth client is not configured for Chrome Extension. Please create a new OAuth client with Application type "Chrome Extension" in Google Cloud Console. See OAUTH_FIX.md for details.';
        } else if (errorMessage.includes('not granted') || errorMessage.includes('revoked') || errorMessage.includes('OAuth2 not granted')) {
          userFriendlyMessage = 'OAuth permissions not granted. Please: 1) Configure OAuth consent screen in Google Cloud Console, 2) Add required scopes (drive.file, userinfo.email), 3) Add your email as a test user if in testing mode. See CONSENT_SCREEN_FIX.md for details.';
        } else if (errorMessage.includes('OAuth2') || errorMessage.includes('oauth2')) {
          userFriendlyMessage = 'OAuth2 configuration error. Please check your extension ID is added to Google Cloud Console as an authorized origin.';
        } else if (errorMessage.includes('invalid_client') || errorMessage.includes('Invalid client')) {
          userFriendlyMessage = 'Invalid client ID. Please verify the client_id in manifest.json matches your Google Cloud Console OAuth client.';
        } else if (errorMessage.includes('access_denied') || errorMessage.includes('Access denied')) {
          userFriendlyMessage = 'Access denied. Please try again and grant all requested permissions.';
        } else if (errorMessage.includes('redirect_uri_mismatch')) {
          userFriendlyMessage = 'Redirect URI mismatch. Make sure your Extension ID is added to Google Cloud Console OAuth client authorized origins.';
        }

        reject(new Error(userFriendlyMessage));
      } else if (!token) {
        reject(new Error('No token received from Chrome Identity API'));
      } else {
        resolve(token);
      }
    });
  });
};

// Check if user is authenticated
async function checkAuthStatus() {
  try {
    const token = await getAuthToken(false);
    await chrome.storage.local.set({ isAuthenticated: true });
    return { authenticated: true, token };
  } catch (error) {
    await chrome.storage.local.set({ isAuthenticated: false });
    return { authenticated: false };
  }
}

// Create offscreen document for recording
async function createOffscreenDocument() {
  const existingContexts = await chrome.offscreen.hasDocument();
  if (existingContexts) {
    console.log('Offscreen document already exists');
    return; // Already exists
  }

  console.log('Creating offscreen document...');
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen/recorder.html',
      reasons: [chrome.offscreen.Reason.USER_MEDIA],
      justification: 'Recording screen, camera and audio for video creation'
    });
    console.log('Offscreen document created successfully');
  } catch (error) {
    console.error('Failed to create offscreen document:', error);
    throw error;
  }
}

// Remove offscreen document
async function closeOffscreenDocument() {
  const existingContexts = await chrome.offscreen.hasDocument();
  if (existingContexts) {
    await chrome.offscreen.closeDocument();
  }
}

// Store partial transfers for chunked uploads
const activeTransfers = new Map();

// Handle messages from popup, content script, and offscreen document
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Ignore messages from ourselves (background script) to prevent loops
  const isFromBackground = !sender.tab && !sender.url?.includes('popup.html') && !sender.url?.includes('recorder.html') && !sender.url?.includes('overlay.js');

  // Handle login request
  if (request.type === 'LOGIN') {
    getAuthToken(true)
      .then(async (token) => {
        console.log('Authentication successful, token received');
        await chrome.storage.local.set({ isAuthenticated: true });
        sendResponse({ success: true, token });
      })
      .catch((error) => {
        console.error('Login error details:', error);
        sendResponse({ success: false, error: error.message || 'Authentication failed' });
      });
    return true; // Keep channel open for async response
  }

  // Handle auth status check
  if (request.type === 'CHECK_AUTH') {
    checkAuthStatus()
      .then((status) => sendResponse(status))
      .catch(() => sendResponse({ authenticated: false }));
    return true;
  }

  // Handle keep-alive ping from popup during recording
  if (request.type === 'KEEP_ALIVE') {
    sendResponse({ alive: true });
    return true;
  }

  // Handle start recording
  if (request.type === 'START_RECORDING' && !request.toOffscreen) {
    // ... forwarding logic ...
    // simplified for brevity in replacement, assuming original code structure
  }

  // Handle Video Chunks (for large files)
  if (request.type === 'VIDEO_CHUNK') {
    const { transferId, chunkIndex, totalChunks, data, metadata } = request;
    console.log(`Background: Received Chunk ${chunkIndex + 1}/${totalChunks} for ${transferId}`);

    if (!activeTransfers.has(transferId)) {
      activeTransfers.set(transferId, {
        chunks: new Array(totalChunks),
        receivedCount: 0,
        metadata: metadata || {}
      });
    }

    const transfer = activeTransfers.get(transferId);
    transfer.chunks[chunkIndex] = data;
    transfer.receivedCount++;
    if (metadata) transfer.metadata = metadata; // Ensure metadata is captured if sent later

    if (transfer.receivedCount === totalChunks) {
      console.log('Background: All chunks received. Reassembling...');
      const fullBase64 = transfer.chunks.join('');
      const { blobSize, mimeType } = transfer.metadata;

      activeTransfers.delete(transferId); // Cleanup

      // Convert base64 to Blob
      console.log('Background: Converting chunked base64 to blob...');
      fetch(fullBase64)
        .then(res => res.blob())
        .then(blob => {
          // Start upload
          handleVideoUpload(blob, blobSize, mimeType, null) // Thumbnail is null for popup recordings for now
            .then((result) => {
              // Notify popup of success via sendMessage or similar mechanism if possible
              // (Since response port is closed, we rely on broadcast)
              chrome.runtime.sendMessage({
                type: 'RECORDING_STOPPED',
                link: result.link,
                folderLink: result.folderLink,
                toPopup: true
              }).catch(() => { });
            });
        })
        .catch(err => {
          console.error('Background: Error converting chunks to blob:', err);
        });
    }

    sendResponse({ success: true });
    return false; // Sync response
  }

  // Legacy single-message handler (keep as fallback for small files if needed, or remove)
  // ...

  // Handle start recording - forward to offscreen only if from popup/content
  if (request.type === 'START_RECORDING' && !isFromBackground) {
    console.log('Background: Received START_RECORDING request');

    // Get the current active tab to pass to desktopCapture
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (!tabs || tabs.length === 0) {
        console.error('Background: No active tab found');
        sendResponse({ success: false, error: 'No active tab found' });
        return;
      }

      const activeTab = tabs[0];
      console.log('Background: Using tab:', activeTab.id);

      // First create or ensure offscreen document exists
      try {
        await createOffscreenDocument();
        console.log('Background: Offscreen document ready');
      } catch (error) {
        console.error('Background: Error creating offscreen document:', error);
        sendResponse({ success: false, error: error.message });
        return;
      }

      // Use chrome.desktopCapture to get screen stream
      // This API is designed for extensions and works with service workers
      const sources = ['screen', 'window', 'tab'];

      console.log('Background: Requesting desktop media...');
      chrome.desktopCapture.chooseDesktopMedia(sources, activeTab, (streamId) => {
        if (!streamId) {
          console.log('Background: User cancelled screen sharing');
          sendResponse({ success: false, error: 'Screen sharing cancelled' });
          return;
        }

        console.log('Background: Got stream ID:', streamId);
        console.log('Background: Waiting 500ms before sending to offscreen...');

        // Wait a bit to ensure offscreen is ready and stream ID is valid
        setTimeout(() => {
          console.log('Background: Sending START_RECORDING to offscreen with stream ID...');
          chrome.runtime.sendMessage({
            type: 'START_RECORDING',
            toOffscreen: true,
            streamId: streamId
          })
            .then(() => {
              console.log('Background: Recording message sent successfully');
              sendResponse({ success: true });
            })
            .catch((error) => {
              console.error('Background: Error sending start message:', error);
              sendResponse({ success: false, error: error.message || 'Failed to start recording' });
            });
        }, 500);
      });
    });

    return true; // Keep channel open for async response
  }

  // Handle pause recording
  if (request.type === 'PAUSE_RECORDING' && !isFromBackground) {
    chrome.runtime.sendMessage({ type: 'PAUSE_RECORDING', toOffscreen: true })
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  // Handle resume recording
  if (request.type === 'RESUME_RECORDING' && !isFromBackground) {
    chrome.runtime.sendMessage({ type: 'RESUME_RECORDING', toOffscreen: true })
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  // Handle stop recording
  if (request.type === 'STOP_RECORDING' && !isFromBackground) {
    // First, notify popup that recording is stopping
    chrome.runtime.sendMessage({ type: 'RECORDING_STOPPING', toPopup: true }).catch(() => {
      // Popup might be closed, that's ok
    });

    // Then stop the actual recording in offscreen
    chrome.runtime.sendMessage({ type: 'STOP_RECORDING', toOffscreen: true })
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error('Error stopping recording:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  // Handle video blob from recorder
  if (request.type === 'VIDEO_BLOB') {
    console.log('Background: Received VIDEO_BLOB, size:', request.blobSize);
    console.log('Background: Starting video upload...');

    // Reconstruct Blob from ArrayBuffer
    const blob = new Blob([request.arrayBuffer], { type: request.mimeType });

    // Don't await here to keep listener responsive
    handleVideoUpload(blob, request.blobSize, request.mimeType, request.thumbnail)
      .then((result) => {
        console.log('Background: Upload successful, result:', result);
        sendResponse({ success: true, link: result.link });
        // Notify popup
        chrome.runtime.sendMessage({
          type: 'RECORDING_STOPPED',
          link: result.link,
          folderLink: result.folderLink,
          toPopup: true
        }).catch(() => {
          // Popup might be closed, ignore error
        });
      })
      .catch((error) => {
        console.error('Background: Upload error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  // Handle cleanup
  if (request.type === 'CLEANUP') {
    closeOffscreenDocument()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  // Handle recording errors
  if (request.type === 'RECORDING_ERROR') {
    console.error('Recording error:', request.error);
    chrome.notifications.create({
      type: 'basic',
      title: 'Recording Error',
      message: request.error || 'An error occurred during recording'
    }).catch(() => {
      // Ignore notification errors
    });
    closeOffscreenDocument();
    return false;
  }
});

// Send progress update to popup
function sendProgressUpdate(percent, status) {
  chrome.runtime.sendMessage({
    type: 'UPLOAD_PROGRESS',
    percent: percent,
    status: status,
    toPopup: true
  }).catch(() => {
    // Popup might be closed, ignore
  });
}

// Handle video upload
async function handleVideoUpload(blob, blobSize, mimeType, thumbnail) {
  const recordingId = `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    console.log('Background: handleVideoUpload started');

    // Save initial upload state
    await saveUploadState({
      id: recordingId,
      status: 'uploading',
      percent: 0,
      startTime: Date.now()
    });

    // Get auth token
    console.log('Background: Checking auth status...');
    sendProgressUpdate(20, 'Preparing upload...');
    const { token } = await checkAuthStatus();
    if (!token) {
      console.error('Background: Not authenticated!');
      throw new Error('Not authenticated');
    }
    console.log('Background: Auth token obtained');

    // Use provided blob directly (no base64 conversion needed anymore)
    console.log('Background: Using provided blob directly');

    // Log upload info
    const sizeMB = (blobSize / 1024 / 1024).toFixed(2);
    console.log(`Background: Uploading video: ${sizeMB} MB`);

    // Upload to Drive
    sendProgressUpdate(40, 'Uploading to Google Drive...');
    const uploadResult = await uploadToDrive(blob, token, (progress) => {
      // Update progress during upload (if supported)
      const uploadPercent = 40 + Math.floor(progress * 0.5); // 40-90% for upload
      sendProgressUpdate(uploadPercent, `Uploading... ${Math.floor(progress)}%`);
    });

    // uploadResult now contains { fileId, webViewLink, folderLink }
    const link = uploadResult.webViewLink;
    const folderLink = uploadResult.folderLink;
    const fileId = uploadResult.fileId;

    sendProgressUpdate(95, 'Finalizing...');

    // Save folder link for future use
    if (folderLink) {
      await saveFolderLink(folderLink);
    }

    // Save recording to history
    const recording = {
      id: recordingId,
      driveLink: link,
      driveFileId: fileId,
      folderLink: folderLink,
      title: `Screen Recording ${new Date().toLocaleString()}`,
      thumbnail: thumbnail, // Use provided thumbnail
      duration: 0, // Could calculate from video if needed
      size: blobSize,
      mode: 'screen-camera', // Will be updated to use actual mode
      timestamp: Date.now()
    };

    await saveRecording(recording);
    console.log('Background: Recording saved to history');

    // Small delay to show 100%
    await new Promise(resolve => setTimeout(resolve, 200));
    sendProgressUpdate(100, 'Upload complete!');

    // Copy link to clipboard
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs.length > 0 && tabs[0].id) {
        await chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: (text) => navigator.clipboard.writeText(text),
          args: [link]
        });
        console.log('Background: Link copied to clipboard');
      } else {
        console.log('Background: No active tab for clipboard');
      }
    } catch (error) {
      console.warn('Background: Clipboard copy failed:', error.message);
    }

    // Show persistent notification with actions
    try {
      await chrome.notifications.create(recordingId, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: 'Recording Uploaded! 🎉',
        message: 'Your video is ready to share. Link copied to clipboard!',
        priority: 2,
        requireInteraction: false,
        buttons: [
          { title: '📂 Open Folder' },
          { title: '🔗 Copy Link' }
        ]
      });

      console.log('Background: Notification created:', recordingId);

      // Store notification data for handling clicks
      await chrome.storage.local.set({
        [`notif_${recordingId}`]: {
          link,
          folderLink,
          recordingId
        }
      });
    } catch (error) {
      console.warn('Background: Failed to create notification:', error.message);
      // Continue anyway - not critical
    }

    // Clear upload state
    await clearUploadState();

    // Cleanup
    await closeOffscreenDocument();

    return { link, folderLink, recordingId };
  } catch (error) {
    console.error('Upload error:', error);

    // Update upload state with error
    await saveUploadState({
      id: recordingId,
      status: 'failed',
      error: error.message,
      timestamp: Date.now()
    });

    chrome.notifications.create({
      type: 'basic',
      title: 'Upload Failed',
      message: `Error: ${error.message}`
    }).catch(() => {
      // Ignore notification errors
    });
    throw error;
  }
}

// Initialize: Check auth status on startup
chrome.runtime.onStartup.addListener(() => {
  checkAuthStatus();
});

chrome.runtime.onInstalled.addListener(() => {
  checkAuthStatus();
});

// Handle notification button clicks
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  const key = `notif_${notificationId}`;
  const result = await chrome.storage.local.get([key]);
  const notifData = result[key];

  if (!notifData) {
    console.warn('Notification data not found for:', notificationId);
    return;
  }

  if (buttonIndex === 0) {
    // Open folder in Drive
    if (notifData.folderLink) {
      chrome.tabs.create({ url: notifData.folderLink });
    }
  } else if (buttonIndex === 1) {
    // Copy link again
    if (notifData.link) {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs && tabs.length > 0 && tabs[0].id) {
          await chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: (text) => navigator.clipboard.writeText(text),
            args: [notifData.link]
          });

          chrome.notifications.create({
            type: 'basic',
            iconUrl: chrome.runtime.getURL('icons/icon128.png'),
            title: 'Link Copied',
            message: 'Recording link copied to clipboard!'
          });
        } else {
          console.warn('Background: No active tab found to copy link');
        }
      } catch (e) {
        console.error('Failed to copy link:', e);
      }
    }
  }

  // Clean up notification data
  chrome.storage.local.remove([key]);
  chrome.notifications.clear(notificationId);
});

// Handle notification click (when user clicks the notification itself)
chrome.notifications.onClicked.addListener(async (notificationId) => {
  const key = `notif_${notificationId}`;
  const result = await chrome.storage.local.get([key]);
  const notifData = result[key];

  if (notifData && notifData.link) {
    // Open the video link
    chrome.tabs.create({ url: notifData.link });

    // Clean up
    chrome.storage.local.remove([key]);
    chrome.notifications.clear(notificationId);
  }
});
