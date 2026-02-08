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
const countdownSection = document.getElementById('countdown-section');
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
const countdownNumber = document.getElementById('countdown-number');

// Mode selection elements
const modeOptions = document.querySelectorAll('.mode-option');
const audioDeviceSelect = document.getElementById('audio-device-select');
const micPermissionInfo = document.getElementById('mic-permission-info');

let currentUploadLink = null;
let selectedAudioDeviceId = ''; // Track selected audio device

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
  // Try to populate audio devices if permission was previously granted
  tryPopulateAudioDevices();
}

// Request microphone permission by opening helper page (avoids popup focus issues)
async function requestMicrophonePermission() {
  // First, check if we already have permission
  const devices = await navigator.mediaDevices.enumerateDevices();
  const audioInputs = devices.filter(device => device.kind === 'audioinput');
  const hasLabels = audioInputs.some(device => device.label);
  
  if (hasLabels) {
    // Already have permission
    await populateAudioDevices();
    return { success: true };
  }
  
  // Open the helper page in a new tab - this avoids the popup closing issue
  chrome.tabs.create({
    url: chrome.runtime.getURL('popup/mic-permission.html'),
    active: true
  });
  
  // Return a pending state - the actual permission will be granted in the new tab
  return { 
    success: false, 
    pending: true, 
    message: 'Microphone permission page opened. Please grant permission in the new tab.' 
  };
}

// Try to populate audio devices without requesting permission (if already granted)
async function tryPopulateAudioDevices() {
  try {
    // Check if we can enumerate devices (this works if permission was previously granted)
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(device => device.kind === 'audioinput');
    
    // If we have devices with labels, permission was granted before
    if (audioInputs.length > 0 && audioInputs.some(device => device.label)) {
      await populateAudioDevices();
      // Update storage to reflect that permission is granted
      await chrome.storage.local.set({ micPermissionGranted: true });
    } else {
      // Check storage for permission status (may have been set by helper page)
      const stored = await chrome.storage.local.get(['micPermissionGranted']);
      if (stored.micPermissionGranted === true) {
        // Permission was granted via helper page, try to populate devices
        await populateAudioDevices();
      } else {
        // Permission not granted yet - add a button to request it
        addPermissionRequestButton();
      }
    }
  } catch (err) {
    console.warn('Error checking audio devices:', err);
    addPermissionRequestButton();
  }
}

// Setup audio device selector - called after microphone permission is granted
async function populateAudioDevices() {
  try {
    // Enumerate all audio devices (permission already granted from getUserMedia)
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(device => device.kind === 'audioinput');
    
    console.log('Found audio devices:', audioInputs.length);
    
    // Clear existing options except default
    audioDeviceSelect.innerHTML = '<option value="">Default Microphone</option>';
    
    // Add each audio device as an option
    audioInputs.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      // If label is empty, it means permission wasn't granted yet
      option.text = device.label || `Microphone ${index + 1}`;
      audioDeviceSelect.appendChild(option);
    });
    
    // Remove permission request button if it exists
    const permissionBtn = document.getElementById('request-mic-permission-btn');
    if (permissionBtn) {
      permissionBtn.remove();
    }
    
    // Set event listener for device selection
    audioDeviceSelect.removeEventListener('change', handleAudioDeviceChange);
    audioDeviceSelect.addEventListener('change', handleAudioDeviceChange);
    
    // Load saved device preference
    chrome.storage.local.get(['selectedAudioDevice'], (result) => {
      if (result.selectedAudioDevice) {
        audioDeviceSelect.value = result.selectedAudioDevice;
        selectedAudioDeviceId = result.selectedAudioDevice;
      }
    });
  } catch (err) {
    console.warn('Error enumerating audio devices:', err);
    // This is optional - continue if enumeration fails
  }
}

// Add a button to request microphone permission (opens in new tab to avoid popup focus issues)
function addPermissionRequestButton() {
  // Check if button already exists
  if (document.getElementById('request-mic-permission-btn')) {
    return;
  }
  
  const audioSettings = document.querySelector('.audio-settings');
  if (!audioSettings) return;
  
  const permissionBtn = document.createElement('button');
  permissionBtn.id = 'request-mic-permission-btn';
  permissionBtn.className = 'btn btn-secondary';
  permissionBtn.style.cssText = 'margin-top: 8px; width: 100%; font-size: 12px; padding: 8px;';
  permissionBtn.innerHTML = '🔊 Enable Microphone Access';
  permissionBtn.onclick = async () => {
    // Open the microphone permission page in a new tab
    // This avoids the popup closing when the permission dialog appears
    chrome.tabs.create({
      url: chrome.runtime.getURL('popup/mic-permission.html'),
      active: true
    });
  };
  
  audioSettings.appendChild(permissionBtn);
}

// Listen for storage changes to detect when permission is granted from the helper page
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.micPermissionGranted) {
    if (changes.micPermissionGranted.newValue === true) {
      console.log('Microphone permission granted via helper page');
      // Refresh audio devices and UI
      populateAudioDevices();
      // Remove the permission button if it exists
      const permissionBtn = document.getElementById('request-mic-permission-btn');
      if (permissionBtn) {
        permissionBtn.textContent = '✓ Microphone enabled';
        setTimeout(() => permissionBtn.remove(), 2000);
      }
      hideStatus();
    }
  }
});

// Handle audio device selection change
function handleAudioDeviceChange(e) {
  selectedAudioDeviceId = e.target.value;
  console.log('Selected audio device:', selectedAudioDeviceId);
  // Save preference
  chrome.storage.local.set({ selectedAudioDevice: selectedAudioDeviceId });
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

  // Add focus handler to audio device selector to check/request permission if needed
  if (audioDeviceSelect) {
    let permissionChecked = false;
    audioDeviceSelect.addEventListener('focus', async () => {
      // Only check once per session
      if (permissionChecked) return;
      permissionChecked = true;
      
      // Check if we have permission by trying to enumerate devices
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        // If no devices have labels, permission wasn't granted
        if (audioInputs.length === 0 || !audioInputs.some(device => device.label)) {
          // Permission not granted - show button if not already shown
          if (!document.getElementById('request-mic-permission-btn')) {
            addPermissionRequestButton();
          }
        } else {
          // Permission granted - populate devices
          await populateAudioDevices();
        }
      } catch (err) {
        // On error, show permission button
        if (!document.getElementById('request-mic-permission-btn')) {
          addPermissionRequestButton();
        }
      }
    });
  }
}

// Show authenticated UI
function showAuthenticated() {
  authSection.classList.add('hidden');
  recordingSection.classList.remove('hidden');
  recordingActiveSection.classList.add('hidden');
  uploadSection.classList.add('hidden');
  uploadCompleteSection.classList.add('hidden');
  
  // Show microphone permission tip
  if (micPermissionInfo) {
    micPermissionInfo.style.display = 'block';
  }
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

    // Check and request microphone permission BEFORE screen capture
    // This gives the user a clear opportunity to grant permission without rushing
    console.log('Popup: [MIC CHECK] Starting microphone permission check...');
    let hasMicPermission = false;
    
    try {
      // Try to enumerate devices - if we get labels, permission was granted
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      console.log('Popup: [MIC CHECK] Found', audioInputs.length, 'audio input devices');
      
      // Check if any device has a label (indicates permission was granted)
      const hasLabels = audioInputs.some(device => device.label && device.label.trim() !== '');
      hasMicPermission = audioInputs.length > 0 && hasLabels;
      
      console.log('Popup: [MIC CHECK] Has microphone permission:', hasMicPermission);
      if (audioInputs.length > 0) {
        const labels = audioInputs.map(d => d.label || '(no label)');
        console.log('Popup: [MIC CHECK] Device labels:', labels);
        console.log('Popup: [MIC CHECK] Has any labels:', hasLabels);
      }
    } catch (err) {
      console.error('Popup: [MIC CHECK] Could not enumerate devices:', err);
      hasMicPermission = false; // Assume no permission on error
    }

    // Also check storage for permission status (set by mic-permission.html helper page)
    if (!hasMicPermission) {
      const stored = await chrome.storage.local.get(['micPermissionGranted']);
      if (stored.micPermissionGranted === true) {
        console.log('Popup: [MIC CHECK] Permission granted via helper page (from storage)');
        hasMicPermission = true;
      }
    }

    // If no permission, prompt user to enable it via the button (don't request inline - popup will close!)
    if (!hasMicPermission) {
      console.log('Popup: [MIC REQUEST] No microphone permission detected');
      showStatus('⚠️ Microphone not enabled. Click "Enable Microphone Access" above, or recording will continue without audio.', 'warning');
      
      // Add the permission button if not already shown
      if (!document.getElementById('request-mic-permission-btn')) {
        addPermissionRequestButton();
      }
      
      // Wait a moment for user to see the message
      await new Promise(resolve => setTimeout(resolve, 1500));
      hideStatus();
    } else {
      console.log('Popup: [MIC CHECK] Microphone permission already granted, skipping request');
    }
    
    console.log('Popup: [MIC FINAL] Final permission status:', hasMicPermission);

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

    // Get microphone stream (only if permission was granted earlier)
    console.log('Popup: Getting microphone stream...');
    if (hasMicPermission) {
      try {
        const audioConstraints = {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        };
        
        // If a specific device is selected, try to use it (but fallback to default if unavailable)
        if (selectedAudioDeviceId) {
          // First try with exact device
          try {
            audioConstraints.deviceId = { exact: selectedAudioDeviceId };
            micStream = await navigator.mediaDevices.getUserMedia({
              audio: audioConstraints
            });
            console.log('Popup: Microphone obtained successfully with selected device');
          } catch (exactErr) {
            // If exact device fails, try with ideal (fallback)
            console.warn('Popup: Selected device unavailable, trying fallback...');
            audioConstraints.deviceId = { ideal: selectedAudioDeviceId };
            micStream = await navigator.mediaDevices.getUserMedia({
              audio: audioConstraints
            });
            console.log('Popup: Microphone obtained with fallback device');
          }
        } else {
          // No specific device selected, use default
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: audioConstraints
          });
          console.log('Popup: Microphone obtained successfully (default device)');
        }
      } catch (err) {
        console.warn('Popup: Failed to get microphone stream:', err.name, err.message);
        // If we had permission but can't get stream, it might be device-specific issue
        if (err.name === 'NotFoundError') {
          showStatus('No microphone found. Recording without audio.', 'warning');
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          showStatus('Microphone is in use by another app. Recording without audio.', 'warning');
        } else if (err.name === 'OverconstrainedError') {
          // Try with default device
          try {
            micStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
              }
            });
            console.log('Popup: Microphone obtained with default device after fallback');
          } catch (fallbackErr) {
            console.warn('Popup: Fallback to default also failed:', fallbackErr);
            micStream = null;
          }
        } else {
          micStream = null;
        }
      }
    } else {
      console.log('Popup: Skipping microphone (permission not granted)');
      micStream = null;
    }

    // Merge streams
    console.log('Popup: Merging streams...');
    if (micStream) {
      mergedStream = await mergeAudioStreams(screenStream, micStream);
    } else {
      mergedStream = screenStream;
    }

    // Show countdown before starting recording
    hideStatus();
    recordingSection.classList.add('hidden');
    countdownSection.classList.remove('hidden');

    // Store the tab ID for overlay injection
    const recordingTabId = tab.id;

    // Start countdown
    await startCountdown();

    // Inject content script for overlay (after countdown)
    // Note: This may fail on some pages (e.g., Chrome Web Store) but recording will still work
    let overlayInjected = false;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: recordingTabId },
        files: ['content/overlay.js']
      });
      await chrome.scripting.insertCSS({
        target: { tabId: recordingTabId },
        files: ['content/overlay.css']
      });
      overlayInjected = true;
      console.log('Popup: Overlay injected successfully');
    } catch (e) {
      console.warn('Popup: Could not inject overlay (this is OK, recording will still work):', e.message);
      // Recording will continue without the overlay - this is fine for restricted pages
    }

    // Show overlay if injection was successful
    if (overlayInjected) {
      try {
        await chrome.tabs.sendMessage(recordingTabId, {
          type: 'SHOW_OVERLAY',
          mode: selectedMode
        });
      } catch (e) {
        console.log('Popup: Overlay message error:', e.message);
      }
    }

    // Start MediaRecorder
    console.log('Popup: Starting MediaRecorder...');
    startMediaRecorder();

    // Update UI - Show recording status without stop button
    isRecording = true;
    countdownSection.classList.add('hidden');
    recordingActiveSection.classList.remove('hidden');
    startRecordingTimer();
    startKeepAlive(); // Keep popup alive during recording

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
    // Stop timer and keep-alive
    stopRecordingTimer();
    stopKeepAlive();
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

// Countdown before recording starts
async function startCountdown() {
  return new Promise((resolve) => {
    let count = 3;
    
    // Ensure countdown number element exists
    if (!countdownNumber) {
      console.error('Countdown element not found!');
      resolve();
      return;
    }
    
    console.log('Popup: Starting countdown...');
    
    const updateCountdown = () => {
      console.log('Popup: Countdown:', count);
      countdownNumber.textContent = count;
      
      // Add a pulse animation class
      countdownNumber.style.transform = 'scale(1.2)';
      setTimeout(() => {
        countdownNumber.style.transform = 'scale(1)';
      }, 200);
      
      count--;
      
      if (count < 0) {
        // Show "Go!" briefly before resolving
        countdownNumber.textContent = 'GO!';
        countdownNumber.style.fontSize = '40px';
        console.log('Popup: Countdown complete!');
        setTimeout(() => {
          countdownNumber.style.fontSize = '';
          resolve();
        }, 500);
      } else {
        setTimeout(updateCountdown, 1000);
      }
    };
    
    // Small delay before starting to ensure UI is ready
    setTimeout(updateCountdown, 100);
  });
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

// Keep popup window persistent during recording
// This prevents the popup from being garbage collected when focus changes
let keepAliveInterval = null;
let keepAliveFailureCount = 0;

function startKeepAlive() {
  if (keepAliveInterval) return;
  
  // Ping the background script periodically to keep the popup alive
  keepAliveInterval = setInterval(() => {
    if (isRecording) {
      chrome.runtime.sendMessage({ type: 'KEEP_ALIVE' })
        .then(() => {
          keepAliveFailureCount = 0; // Reset on success
        })
        .catch((error) => {
          keepAliveFailureCount++;
          console.warn(`Keep-alive failed (attempt ${keepAliveFailureCount}):`, error);
          
          // If too many failures, log warning but continue recording
          if (keepAliveFailureCount >= 3) {
            console.error('Keep-alive mechanism failing - popup may be at risk of termination');
          }
        });
    } else {
      stopKeepAlive();
    }
  }, 5000); // Every 5 seconds
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
    keepAliveFailureCount = 0;
  }
}

// Initialize on load
init();
showExtensionId();

setupRecordingsUI(); // Initialize recordings history UI
