// Popup script - handles UI and user interactions
// Uses chrome.storage for recording history (see utils/storage.js for structure)

let isRecording = false;
let recordingStartTime = null;
let timerInterval = null;
let selectedMode = 'screen-camera'; // Default mode

// DOM elements
const authSection = document.getElementById('auth-section');
const recordingSection = document.getElementById('recording-section');
const recordingActiveSection = document.getElementById('recording-active-section');
const uploadSection = document.getElementById('upload-section');
const uploadCompleteSection = document.getElementById('upload-complete-section');
const recordingsSection = document.getElementById('recordings-section');
const connectBtn = document.getElementById('connect-btn');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const statusDiv = document.getElementById('status');
const progressBar = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const uploadStatus = document.getElementById('upload-status');
const driveLink = document.getElementById('drive-link');
const copyLinkBtn = document.getElementById('copy-link-btn');
const recordingTimer = document.getElementById('recording-timer');

// Mode selection elements
const modeOptions = document.querySelectorAll('.mode-option');

let currentUploadLink = null;

// Check authentication status on load
async function init() {
  showStatus('Checking authentication...', 'info');

  try {
    const response = await chrome.runtime.sendMessage({ type: 'CHECK_AUTH' });

    if (response.authenticated) {
      showAuthenticated();
      await restoreRuntimeState();
    } else {
      showUnauthenticated();
    }
  } catch (error) {
    console.error('Auth check error:', error);
    showUnauthenticated();
  }

  hideStatus();
  setupModeSelection();
}

async function restoreRuntimeState() {
  const { activeRecording, currentUpload } = await chrome.storage.local.get(['activeRecording', 'currentUpload']);

  if (activeRecording?.startTime) {
    isRecording = true;
    recordingSection.classList.add('hidden');
    recordingActiveSection.classList.remove('hidden');
    uploadSection.classList.add('hidden');
    uploadCompleteSection.classList.add('hidden');
    startRecordingTimer(activeRecording.startTime);
    return;
  }

  if (currentUpload?.status === 'uploading') {
    recordingSection.classList.add('hidden');
    recordingActiveSection.classList.add('hidden');
    uploadSection.classList.remove('hidden');
    uploadCompleteSection.classList.add('hidden');
    updateProgress(currentUpload.percent || 10, currentUpload.statusText || 'Uploading...');
  }
}

// Setup mode selection handlers
function setupModeSelection() {
  modeOptions.forEach(option => {
    option.addEventListener('click', () => {
      // Remove active class from all options
      modeOptions.forEach(opt => opt.classList.remove('active'));

      // Add active class to clicked option
      option.classList.add('active');

      // Update selected mode
      selectedMode = option.dataset.mode;

      // Store mode preference
      chrome.storage.local.set({ recordingMode: selectedMode });
    });
  });

  // Load saved mode preference
  chrome.storage.local.get(['recordingMode'], (result) => {
    if (result.recordingMode) {
      selectedMode = result.recordingMode;
      const savedOption = document.querySelector(`[data-mode="${selectedMode}"]`);
      if (savedOption) {
        modeOptions.forEach(opt => opt.classList.remove('active'));
        savedOption.classList.add('active');
      }
    } else {
      // Set default active mode
      document.getElementById('mode-screen-camera').classList.add('active');
    }
  });
}

// Show authenticated UI
function showAuthenticated() {
  authSection.classList.add('hidden');
  recordingSection.classList.remove('hidden');
  recordingActiveSection.classList.add('hidden');
  uploadSection.classList.add('hidden');
  uploadCompleteSection.classList.add('hidden');
}

// Show unauthenticated UI
function showUnauthenticated() {
  authSection.classList.remove('hidden');
  recordingSection.classList.add('hidden');
}

// Handle connect button click
connectBtn.addEventListener('click', async () => {
  connectBtn.disabled = true;
  showStatus('Connecting to Google Drive...', 'info');

  try {
    const response = await chrome.runtime.sendMessage({ type: 'LOGIN' });

    if (response && response.success) {
      showStatus('Connected successfully!', 'success');
      setTimeout(() => {
        showAuthenticated();
        hideStatus();
      }, 1000);
    } else {
      const errorMsg = response?.error || 'Unknown error';
      console.error('Login failed:', errorMsg);
      showStatus(`Connection failed: ${errorMsg}`, 'error');
    }
  } catch (error) {
    console.error('Login error:', error);
    showStatus(`Connection failed: ${error.message || 'Please check console for details'}`, 'error');
  } finally {
    connectBtn.disabled = false;
  }
});

// Handle start recording button
startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  showStatus('Starting recording...', 'info');

  try {
    console.log('Popup: Starting recording');

    // Get current active tab for overlay (optional for camera-only mode)
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const hasRecordableTab =
      !!tab?.id &&
      !!tab.url &&
      !tab.url.startsWith('chrome://') &&
      !tab.url.startsWith('chrome-extension://') &&
      !tab.url.startsWith('edge://') &&
      !tab.url.startsWith('about:');

    if (!hasRecordableTab && selectedMode !== 'camera-only') {
      showStatus('Cannot record this page. Please open a regular website and try again.', 'error');
      return;
    }

    if (hasRecordableTab) {
      // Inject content script for overlay
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/overlay.js']
        });
        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ['content/overlay.css']
        });
      } catch (e) {
        console.log('Script injection:', e);
      }

      // Show overlay UI
      try {
        const overlayMode = selectedMode === 'camera-only' ? 'screen-only' : selectedMode;
        await chrome.tabs.sendMessage(tab.id, {
          type: 'SHOW_OVERLAY',
          mode: overlayMode
        });
      } catch (e) {
        console.log('Overlay message:', e);
      }
    }

    // Start actual recorder in background/offscreen
    const startResponse = await chrome.runtime.sendMessage({
      type: 'START_RECORDING',
      mode: selectedMode,
      tabId: tab?.id
    });

    if (!startResponse?.success) {
      try {
        if (tab?.id) {
          await chrome.tabs.sendMessage(tab.id, { type: 'HIDE_OVERLAY' });
        }
      } catch (e) {
        console.log('Overlay cleanup after start failure:', e);
      }
      throw new Error(startResponse?.error || 'Failed to start recording');
    }

    // Update UI
    isRecording = true;
    recordingSection.classList.add('hidden');
    recordingActiveSection.classList.remove('hidden');
    uploadSection.classList.add('hidden');
    uploadCompleteSection.classList.add('hidden');
    startRecordingTimer();
    hideStatus();

    console.log('Popup: Recording started successfully!');

  } catch (error) {
    console.error('Start recording error:', error);
    showStatus('Failed to start recording: ' + error.message, 'error');
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id) {
        await chrome.tabs.sendMessage(activeTab.id, { type: 'HIDE_OVERLAY' });
      }
    } catch (e) {
      // Ignore overlay cleanup failures
    }
    isRecording = false;
    recordingActiveSection.classList.add('hidden');
    recordingSection.classList.remove('hidden');
  } finally {
    startBtn.disabled = false;
  }
});

// Handle stop recording button (in popup)
stopBtn.addEventListener('click', async () => {
  stopBtn.disabled = true;
  console.log('Popup: Stop button clicked');

  try {
    // Update UI immediately while processing stop/upload
    stopRecordingTimer();
    isRecording = false;
    recordingActiveSection.classList.add('hidden');
    recordingSection.classList.add('hidden');
    uploadSection.classList.remove('hidden');
    uploadCompleteSection.classList.add('hidden');
    updateProgress(10, 'Processing video...');
    hideStatus();

    // Hide overlay
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id, { type: 'HIDE_OVERLAY' });
    } catch (e) {
      console.log('Hide overlay error:', e);
    }

    // Stop recorder in offscreen
    const response = await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
    if (!response?.success) {
      throw new Error(response?.error || 'Failed to stop recording');
    }

  } catch (error) {
    console.error('Stop recording error:', error);
    showStatus('Failed to stop recording: ' + error.message, 'error');
    recordingActiveSection.classList.add('hidden');
    recordingSection.classList.remove('hidden');
    uploadSection.classList.add('hidden');
  } finally {
    stopBtn.disabled = false;
  }
});

// Show status message
function showStatus(message, type = 'info') {
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  statusDiv.classList.remove('hidden');
}

// Hide status message
function hideStatus() {
  statusDiv.classList.add('hidden');
}

// Update progress bar
function updateProgress(percent, statusText = null) {
  if (progressBar) {
    progressBar.style.width = `${percent}%`;
  }
  if (progressText) {
    progressText.textContent = `${percent}%`;
  }
  if (statusText && uploadStatus) {
    uploadStatus.textContent = statusText;
  }
}

// Recording timer functions
function startRecordingTimer(startTime = Date.now()) {
  recordingStartTime = startTime;
  updateTimerDisplay();
  if (timerInterval) {
    clearInterval(timerInterval);
  }
  timerInterval = setInterval(updateTimerDisplay, 1000);
}

function stopRecordingTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  recordingStartTime = null;
}

function updateTimerDisplay() {
  if (!recordingStartTime || !recordingTimer) return;

  const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;

  recordingTimer.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Show upload complete with link
function showUploadComplete(link) {
  currentUploadLink = link;

  // Hide upload progress
  uploadSection.classList.add('hidden');

  // Show complete section
  uploadCompleteSection.classList.remove('hidden');

  // Set drive link
  if (driveLink) {
    driveLink.href = link;
  }

  // Copy link button handler
  if (copyLinkBtn) {
    copyLinkBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(link);
        const originalHTML = copyLinkBtn.innerHTML;
        copyLinkBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M15 5L7 13L3 9" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Copied!';
        setTimeout(() => {
          copyLinkBtn.innerHTML = originalHTML;
        }, 2000);
      } catch (error) {
        alert('Link: ' + link);
      }
    };
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Only process messages intended for popup (or broadcast messages)
  const isForPopup = !request.toOffscreen || request.toPopup === true;

  if (request.type === 'RECORDING_STOPPED' && isForPopup) {
    console.log('Popup: Recording stopped, link:', request.link);
    isRecording = false;
    stopRecordingTimer();

    if (request.link) {
      showUploadComplete(request.link);
    } else {
      showStatus('Video uploaded! Link copied to clipboard.', 'success');
      setTimeout(() => {
        hideStatus();
        // Reset to recording section
        recordingActiveSection.classList.add('hidden');
        recordingSection.classList.remove('hidden');
      }, 3000);
    }
  } else if (request.type === 'UPLOAD_PROGRESS' && isForPopup) {
    console.log('Popup: Upload progress:', request.percent, '%');
    // Handle upload progress updates
    const percent = request.percent || 0;
    const status = request.status || 'Uploading...';
    updateProgress(percent, status);

    // Make sure upload section is visible
    if (uploadSection.classList.contains('hidden')) {
      recordingActiveSection.classList.add('hidden');
      recordingSection.classList.add('hidden');
      uploadSection.classList.remove('hidden');
      uploadCompleteSection.classList.add('hidden');
    }
  } else if (request.type === 'RECORDING_STOPPING' && isForPopup) {
    console.log('Popup: Recording is stopping...');
    // Handle when recording is being stopped (from overlay or popup)
    isRecording = false;
    stopRecordingTimer();

    // Show upload progress
    recordingActiveSection.classList.add('hidden');
    recordingSection.classList.add('hidden');
    uploadSection.classList.remove('hidden');
    uploadCompleteSection.classList.add('hidden');
    uploadStatus.textContent = 'Processing video...';
    updateProgress(10);
    hideStatus();
  } else if (request.type === 'RECORDING_ERROR' && isForPopup) {
    console.error('Popup: Recording error received:', request.error);
    isRecording = false;
    stopRecordingTimer();
    uploadSection.classList.add('hidden');
    recordingActiveSection.classList.add('hidden');
    recordingSection.classList.remove('hidden');
    showStatus(request.error || 'Recording failed', 'error');
  }
});

// Show extension ID for setup
function showExtensionId() {
  const extensionId = chrome.runtime.id;
  const extensionIdEl = document.getElementById('extension-id');
  const extensionIdShortEl = document.getElementById('extension-id-short');

  if (extensionIdEl) {
    extensionIdEl.textContent = extensionId;
  }
  if (extensionIdShortEl) {
    extensionIdShortEl.textContent = extensionId;
  }
}

// Initialize on load
init();
showExtensionId();

setupRecordingsUI(); // Initialize recordings history UI
