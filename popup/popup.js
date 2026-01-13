// Popup script - handles UI and user interactions
// Uses chrome.storage for recording history (see utils/storage.js for structure)

let isRecording = false;
let recordingStartTime = null;
let timerInterval = null;
let selectedMode = 'screen-camera'; // Default mode

// Recording variables
let screenStream = null;
let micStream = null;
let mergedStream = null;
let mediaRecorder = null;
let recordedChunks = [];

// DOM elements
const authSection = document.getElementById('auth-section');
const recordingSection = document.getElementById('recording-section');
const recordingActiveSection = document.getElementById('recording-active-section');
const uploadSection = document.getElementById('upload-section');
const uploadCompleteSection = document.getElementById('upload-complete-section');
const recordingsSection = document.getElementById('recordings-section');
const connectBtn = document.getElementById('connect-btn');
const startBtn = document.getElementById('start-btn');
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

// Handle start recording button - NEW POPUP-BASED RECORDING
startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  showStatus('Starting recording...', 'info');

  try {
    console.log('Popup: Starting recording from popup');

    // Get current active tab for overlay
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Check if we can inject scripts
    if (!tab.url) {
      showStatus('Cannot access current page. Please try again.', 'error');
      startBtn.disabled = false;
      return;
    }

    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
      showStatus('Cannot record on Chrome internal pages. Please navigate to a regular website and try again.', 'error');
      startBtn.disabled = false;
      return;
    }

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

    // Show overlay
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'SHOW_OVERLAY',
        mode: selectedMode
      });
    } catch (e) {
      console.log('Overlay message:', e);
    }

    // Request screen capture (THIS WILL WORK - popup has user gesture!)
    console.log('Popup: Requesting screen capture...');
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 }
        },
        audio: true // Try to get system audio
      });
      console.log('Popup: Screen stream obtained!');
    } catch (err) {
      console.error('Popup: getDisplayMedia error:', err);
      showStatus('Screen sharing cancelled or failed', 'error');
      startBtn.disabled = false;
      return;
    }

    // Request microphone (optional)
    console.log('Popup: Requesting microphone...');
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      console.log('Popup: Microphone obtained');
    } catch (err) {
      console.warn('Popup: Microphone denied, continuing without it');
      micStream = null;
    }

    // Merge streams
    console.log('Popup: Merging streams...');
    if (micStream) {
      mergedStream = await mergeAudioStreams(screenStream, micStream);
    } else {
      mergedStream = screenStream;
    }

    // Start MediaRecorder
    console.log('Popup: Starting MediaRecorder...');
    startMediaRecorder();

    // Update UI - Show recording status without stop button
    isRecording = true;
    recordingSection.classList.add('hidden');
    recordingActiveSection.classList.remove('hidden');
    startRecordingTimer();
    hideStatus();

    console.log('Popup: Recording started successfully!');

  } catch (error) {
    console.error('Start recording error:', error);
    showStatus('Failed to start recording: ' + error.message, 'error');
    cleanup();
  } finally {
    startBtn.disabled = false;
  }
});

// Handle stop recording - called when overlay requests stop
async function stopRecording() {
  console.log('Popup: Stop recording requested');

  try {
    // Stop timer
    stopRecordingTimer();
    isRecording = false;

    // Hide overlay
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id, { type: 'HIDE_OVERLAY' });
    } catch (e) {
      console.log('Hide overlay error:', e);
    }

    // Stop MediaRecorder (this triggers onstop which handles upload)
    console.log('Popup: Stopping MediaRecorder...');
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    } else {
      console.log('Popup: MediaRecorder already inactive');
      handleRecordingStop();
    }

  } catch (error) {
    console.error('Stop recording error:', error);
    showStatus('Failed to stop recording', 'error');
    cleanup();
    recordingActiveSection.classList.add('hidden');
    recordingSection.classList.remove('hidden');
  }
}

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
function startRecordingTimer() {
  recordingStartTime = Date.now();
  updateTimerDisplay();
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

  // Handle stop request from overlay
  if (request.type === 'STOP_RECORDING_FROM_OVERLAY') {
    console.log('Popup: Received stop request from overlay');
    stopRecording(); // Call the stop recording function
    sendResponse({ success: true });
    return;
  }

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

// Helper functions for popup-based recording

// Merge audio streams
async function mergeAudioStreams(screenStream, micStream) {
  const audioContext = new AudioContext();
  const destination = audioContext.createMediaStreamDestination();

  // Add screen audio if available
  const screenAudioTracks = screenStream.getAudioTracks();
  if (screenAudioTracks.length > 0) {
    const screenSource = audioContext.createMediaStreamSource(
      new MediaStream([screenAudioTracks[0]])
    );
    screenSource.connect(destination);
  }

  // Add microphone audio
  if (micStream) {
    const micAudioTracks = micStream.getAudioTracks();
    if (micAudioTracks.length > 0) {
      const micSource = audioContext.createMediaStreamSource(
        new MediaStream([micAudioTracks[0]])
      );
      micSource.connect(destination);
    }
  }

  // Combine video track with merged audio
  const videoTrack = screenStream.getVideoTracks()[0];
  const combinedStream = new MediaStream();
  combinedStream.addTrack(videoTrack);

  destination.stream.getAudioTracks().forEach(track => {
    combinedStream.addTrack(track);
  });

  return combinedStream;
}

// Start MediaRecorder
function startMediaRecorder() {
  recordedChunks = [];

  // Prioritize MP4 (best for Drive), then VP8 (best compatibility), then default
  let mimeType = 'video/webm;codecs=vp8';

  if (MediaRecorder.isTypeSupported('video/mp4')) {
    mimeType = 'video/mp4';
  } else if (!MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
    mimeType = 'video/webm'; // Fallback to browser default if VP8 explicit fails
  }

  const options = {
    mimeType: mimeType,
    videoBitsPerSecond: 2500000
  };

  mediaRecorder = new MediaRecorder(mergedStream, options);

  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      recordedChunks.push(event.data);
      console.log('Popup: Chunk recorded, total chunks:', recordedChunks.length);
    }
  };

  mediaRecorder.onstop = async () => {
    console.log('Popup: MediaRecorder stopped');
    await handleRecordingStop();
  };

  mediaRecorder.onerror = (event) => {
    console.error('Popup: MediaRecorder error:', event);
  };

  // Handle user stopping screen share
  if (screenStream) {
    screenStream.getVideoTracks()[0].onended = () => {
      console.log('Popup: Screen sharing stopped by user');
      if (isRecording) {
        stopRecording();
      }
    };
  }

  mediaRecorder.start(1000); // Collect data every second
  console.log('Popup: MediaRecorder started');
}

// Handle recording stop
async function handleRecordingStop() {
  try {
    console.log('Popup: Handling recording stop, chunks:', recordedChunks.length);

    // Show upload progress
    recordingActiveSection.classList.add('hidden');
    uploadSection.classList.remove('hidden');
    updateProgress(10, 'Processing video...');

    // Create blob
    // Use the actual mime type from the recorder
    const mimeType = mediaRecorder.mimeType || 'video/webm';
    const blob = new Blob(recordedChunks, { type: mimeType });
    console.log('Popup: Blob created, size:', blob.size, 'bytes');

    if (blob.size === 0) {
      throw new Error('Recording is empty');
    }

    // Convert to Base64 String (safest for message passing)
    updateProgress(20, 'Preparing upload...');

    const reader = new FileReader();
    reader.readAsDataURL(blob);

    reader.onloadend = async () => {
      const base64Data = reader.result;

      // Chunking settings (10MB)
      const CHUNK_SIZE = 10 * 1024 * 1024;
      const totalChunks = Math.ceil(base64Data.length / CHUNK_SIZE);
      const transferId = Date.now().toString();

      console.log(`Popup: Splitting video (${blob.size} bytes) into ${totalChunks} chunks`);
      updateProgress(20, 'Preparing chunks...');

      try {
        for (let i = 0; i < totalChunks; i++) {
          const chunk = base64Data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
          const percent = 20 + Math.floor((i / totalChunks) * 10);
          updateProgress(percent, `Transferring data ${i + 1}/${totalChunks}...`);

          await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
              type: 'VIDEO_CHUNK',
              transferId,
              chunkIndex: i,
              totalChunks,
              data: chunk,
              metadata: i === 0 ? { blobSize: blob.size, mimeType: blob.type } : null
            }, (response) => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve(response);
              }
            });
          });
        }
        console.log('Popup: All chunks sent successfully');
        // Background handles the rest

      } catch (error) {
        console.error('Popup: Chunk transfer failed:', error);
        showStatus('Transfer failed: ' + error.message, 'error');
      }
    };

    reader.onerror = (error) => {
      console.error('Popup: FileReader error:', error);
      showStatus('Failed to process video file', 'error');
    };

  } catch (error) {
    console.error('Popup: Error handling stop:', error);
    showStatus('Error processing video: ' + error.message, 'error');
  } finally {
    cleanup();
  }
}

// Cleanup resources
function cleanup() {
  console.log('Popup: Cleaning up resources');

  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }

  if (micStream) {
    micStream.getTracks().forEach(track => track.stop());
    micStream = null;
  }

  if (mergedStream) {
    mergedStream.getTracks().forEach(track => track.stop());
    mergedStream = null;
  }

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try {
      mediaRecorder.stop();
    } catch (e) {
      console.log('Popup: Error stopping mediaRecorder:', e);
    }
  }

  mediaRecorder = null;
  recordedChunks = [];
}

// Initialize on load
init();
showExtensionId();

setupRecordingsUI(); // Initialize recordings history UI
