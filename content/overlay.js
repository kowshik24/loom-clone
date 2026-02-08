// Content script - Creates the Loom-like UI overlay with camera bubble

let overlayContainer = null;
let shadowRoot = null;
let cameraBubble = null;
let controlsBar = null;
let cameraStream = null;
let isDragging = false;
let dragOffset = { x: 0, y: 0 };
let recordingMode = 'screen-camera'; // Default mode
let isPaused = false;
let recordingTimer = null;
let recordingStartTime = null;
let timerInterval = null;

// Create overlay with Shadow DOM
function createOverlay() {
  // Check if overlay already exists in DOM (handles script re-injection)
  const existingOverlay = document.getElementById('loom-clone-overlay');
  if (existingOverlay) {
    console.log('Overlay: Found existing overlay in DOM, removing it first');
    existingOverlay.remove();
  }
  
  if (overlayContainer) {
    return; // Already exists in memory
  }

  // Create container
  overlayContainer = document.createElement('div');
  overlayContainer.id = 'loom-clone-overlay';
  document.body.appendChild(overlayContainer);

  // Create Shadow DOM
  shadowRoot = overlayContainer.attachShadow({ mode: 'open' });

  // Inject CSS (inline for Shadow DOM compatibility)
  const style = document.createElement('style');
  style.textContent = `
    * {
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    
    #loom-clone-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 2147483647;
    }
    
    .camera-bubble {
      position: fixed;
      width: 150px;
      height: 150px;
      border-radius: 50%;
      overflow: hidden;
      border: 3px solid #625DF5;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.1);
      pointer-events: all;
      cursor: grab;
      background: #000;
      z-index: 2147483647;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    
    .camera-bubble:hover {
      transform: scale(1.08);
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.2);
    }
    
    .camera-bubble:active {
      cursor: grabbing;
      transform: scale(1.05);
    }
    
    .camera-bubble.hidden {
      display: none;
    }
    
    #camera-preview {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transform: scaleX(-1);
    }
    
    .camera-bubble-controls {
      position: absolute;
      bottom: -8px;
      right: -8px;
      display: flex;
      gap: 6px;
    }
    
    .bubble-control-btn {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 2px solid white;
      background: #625DF5;
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }
    
    .bubble-control-btn:hover {
      transform: scale(1.1);
      background: #534AE2;
    }
    
    .controls-bar {
      position: fixed;
      bottom: 32px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 24px;
      background: rgba(26, 26, 26, 0.95);
      border-radius: 48px;
      pointer-events: all;
      z-index: 2147483647;
      backdrop-filter: blur(20px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .recording-indicator {
      display: flex;
      align-items: center;
      gap: 10px;
      padding-right: 16px;
      border-right: 1px solid rgba(255, 255, 255, 0.2);
    }
    
    .recording-dot {
      width: 10px;
      height: 10px;
      background: #FF3B3B;
      border-radius: 50%;
      animation: pulse 2s ease-in-out infinite;
    }
    
    @keyframes pulse {
      0%, 100% {
        transform: scale(1);
        opacity: 1;
      }
      50% {
        transform: scale(1.2);
        opacity: 0.8;
      }
    }
    
    .recording-time {
      font-size: 14px;
      font-weight: 600;
      color: white;
      font-variant-numeric: tabular-nums;
      min-width: 50px;
    }
    
    .control-buttons {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    
    .control-btn {
      padding: 0;
      width: 40px;
      height: 40px;
      border: none;
      border-radius: 50%;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    
    .control-btn:hover {
      transform: scale(1.1);
    }
    
    .control-btn:active {
      transform: scale(0.95);
    }
    
    .pause-btn {
      background: #625DF5;
    }
    
    .pause-btn:hover {
      background: #534AE2;
    }
    
    .pause-btn.paused {
      background: #34A853;
    }
    
    .stop-btn {
      background: #FF3B3B;
      width: auto;
      padding: 0 20px;
      border-radius: 24px;
      gap: 8px;
    }
    
    .stop-btn:hover {
      background: #E62E2E;
    }
    
    .trash-btn {
      background: rgba(255, 255, 255, 0.1);
    }
    
    .trash-btn:hover {
      background: rgba(255, 59, 59, 0.2);
    }
    
    @keyframes slideUp {
      from {
        transform: translate(-50%, 20px);
        opacity: 0;
      }
      to {
        transform: translate(-50%, 0);
        opacity: 1;
      }
    }
    
    .controls-bar {
      animation: slideUp 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    }
    
    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: scale(0.8);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }
    
    .camera-bubble {
      animation: fadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    }
  `;
  shadowRoot.appendChild(style);

  // Create camera bubble (only if mode includes camera)
  if (recordingMode !== 'screen-only') {
    cameraBubble = document.createElement('div');
    cameraBubble.id = 'camera-bubble';
    cameraBubble.className = 'camera-bubble';
    
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.id = 'camera-preview';
    cameraBubble.appendChild(video);
    
    shadowRoot.appendChild(cameraBubble);

    // Make camera bubble draggable
    setupDragging();

    // Start camera preview
    startCameraPreview();
  }

  // Create controls bar
  controlsBar = document.createElement('div');
  controlsBar.id = 'controls-bar';
  controlsBar.className = 'controls-bar';
  
  // Recording indicator
  const recordingIndicator = document.createElement('div');
  recordingIndicator.className = 'recording-indicator';
  
  const recordingDot = document.createElement('div');
  recordingDot.className = 'recording-dot';
  
  recordingTimer = document.createElement('div');
  recordingTimer.className = 'recording-time';
  recordingTimer.textContent = '00:00';
  
  recordingIndicator.appendChild(recordingDot);
  recordingIndicator.appendChild(recordingTimer);
  
  // Control buttons container
  const controlButtons = document.createElement('div');
  controlButtons.className = 'control-buttons';
  
  // Pause/Resume button
  const pauseBtn = document.createElement('button');
  pauseBtn.id = 'pause-recording-btn';
  pauseBtn.className = 'control-btn pause-btn';
  pauseBtn.title = 'Pause';
  pauseBtn.innerHTML = `
    <svg width="12" height="14" viewBox="0 0 12 14" fill="white">
      <rect width="4" height="14" rx="1"/>
      <rect x="8" width="4" height="14" rx="1"/>
    </svg>
  `;
  pauseBtn.addEventListener('click', handlePauseResume);
  
  // Stop button
  const stopBtn = document.createElement('button');
  stopBtn.id = 'stop-recording-btn';
  stopBtn.className = 'control-btn stop-btn';
  stopBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 14 14" fill="white">
      <rect width="14" height="14" rx="2"/>
    </svg>
    <span>Stop</span>
  `;
  stopBtn.addEventListener('click', handleStopRecording);
  
  controlButtons.appendChild(pauseBtn);
  controlButtons.appendChild(stopBtn);
  
  controlsBar.appendChild(recordingIndicator);
  controlsBar.appendChild(controlButtons);
  shadowRoot.appendChild(controlsBar);

  // Start recording timer
  startTimer();
}

// Start camera preview
async function startCameraPreview() {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 320 },
        height: { ideal: 320 },
        facingMode: 'user'
      },
      audio: false
    });

    const video = shadowRoot.getElementById('camera-preview');
    if (video) {
      video.srcObject = cameraStream;
    }
  } catch (error) {
    console.error('Error accessing camera:', error);
    showError('Could not access camera');
  }
}

// Setup dragging functionality
function setupDragging() {
  cameraBubble.addEventListener('mousedown', (e) => {
    isDragging = true;
    const rect = cameraBubble.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
    cameraBubble.style.cursor = 'grabbing';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    const x = e.clientX - dragOffset.x;
    const y = e.clientY - dragOffset.y;
    
    // Constrain to viewport
    const maxX = window.innerWidth - cameraBubble.offsetWidth;
    const maxY = window.innerHeight - cameraBubble.offsetHeight;
    
    cameraBubble.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
    cameraBubble.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      cameraBubble.style.cursor = 'grab';
    }
  });
}

// Timer functions
function startTimer() {
  recordingStartTime = Date.now();
  updateTimer();
  timerInterval = setInterval(updateTimer, 1000);
}

function updateTimer() {
  if (!recordingStartTime || !recordingTimer) return;
  
  const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  
  recordingTimer.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// Handle pause/resume
async function handlePauseResume() {
  const pauseBtn = shadowRoot.getElementById('pause-recording-btn');
  
  if (isPaused) {
    // Resume
    isPaused = false;
    pauseBtn.classList.remove('paused');
    pauseBtn.title = 'Pause';
    pauseBtn.innerHTML = `
      <svg width="12" height="14" viewBox="0 0 12 14" fill="white">
        <rect width="4" height="14" rx="1"/>
        <rect x="8" width="4" height="14" rx="1"/>
      </svg>
    `;
    startTimer();
  } else {
    // Pause
    isPaused = true;
    pauseBtn.classList.add('paused');
    pauseBtn.title = 'Resume';
    pauseBtn.innerHTML = `
      <svg width="12" height="14" viewBox="0 0 12 14" fill="white">
        <path d="M2 1.5L11 7L2 12.5V1.5Z"/>
      </svg>
    `;
    stopTimer();
  }
  
  // Send pause/resume message to background
  try {
    await chrome.runtime.sendMessage({ 
      type: isPaused ? 'PAUSE_RECORDING' : 'RESUME_RECORDING' 
    });
  } catch (error) {
    console.error('Error toggling pause:', error);
  }
}

// Handle stop recording - Updated to work with popup recording
async function handleStopRecording() {
  console.log('Overlay: Stop button clicked');
  
  // Stop timer
  stopTimer();
  
  // Stop camera stream
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }

  // Send message to popup to stop recording (popup handles the MediaRecorder)
  try {
    await chrome.runtime.sendMessage({ type: 'STOP_RECORDING_FROM_OVERLAY' });
    console.log('Overlay: Stop message sent to popup');
  } catch (error) {
    console.error('Overlay: Error sending stop message:', error);
  }

  // Hide overlay
  hideOverlay();
}

// Show overlay
function showOverlay(mode = 'screen-camera') {
  recordingMode = mode;
  
  if (!overlayContainer) {
    createOverlay();
  }
  overlayContainer.style.display = 'block';
  
  // Position camera bubble in bottom left corner initially
  setTimeout(() => {
    if (cameraBubble) {
      cameraBubble.style.left = '32px';
      cameraBubble.style.top = `${window.innerHeight - 180}px`;
    }
  }, 100);
}

// Hide overlay
function hideOverlay() {
  // Stop timer
  stopTimer();
  
  if (overlayContainer) {
    overlayContainer.style.display = 'none';
  }
  
  // Stop camera stream
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
}

// Remove overlay completely
function removeOverlay() {
  stopTimer();
  
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  
  if (overlayContainer) {
    overlayContainer.remove();
    overlayContainer = null;
    shadowRoot = null;
    cameraBubble = null;
    controlsBar = null;
    recordingTimer = null;
  }
}

// Show error message
function showError(message) {
  // Could add an error toast here
  console.error(message);
}

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'SHOW_OVERLAY') {
    showOverlay(request.mode || 'screen-camera');
    sendResponse({ success: true });
  } else if (request.type === 'HIDE_OVERLAY') {
    hideOverlay();
    sendResponse({ success: true });
  } else if (request.type === 'REMOVE_OVERLAY') {
    removeOverlay();
    sendResponse({ success: true });
  }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  removeOverlay();
});

