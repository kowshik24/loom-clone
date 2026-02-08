// Microphone Permission Helper Script
// Handles microphone permission requests in a separate tab to avoid popup focus issues

const enableBtn = document.getElementById('enable-btn');
const skipBtn = document.getElementById('skip-btn');
const statusDiv = document.getElementById('status');
const instructionsDiv = document.getElementById('instructions');
const closeTimerDiv = document.getElementById('close-timer');
const deviceSelectContainer = document.getElementById('device-select-container');
const micDeviceSelect = document.getElementById('mic-device-select');

let closeCountdown = null;
let selectedDeviceId = '';

function showStatus(message, type) {
  statusDiv.textContent = message;
  statusDiv.className = 'status ' + type;
}

function startCloseTimer(seconds) {
  let remaining = seconds;
  closeTimerDiv.textContent = `This tab will close in ${remaining} seconds...`;
  
  closeCountdown = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(closeCountdown);
      window.close();
    } else {
      closeTimerDiv.textContent = `This tab will close in ${remaining} seconds...`;
    }
  }, 1000);
}

// Populate microphone devices after permission is granted
async function populateMicrophoneDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(d => d.kind === 'audioinput');
    
    if (audioInputs.length === 0) {
      return;
    }
    
    // Clear existing options
    micDeviceSelect.innerHTML = '';
    
    // Add default option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Default Microphone';
    micDeviceSelect.appendChild(defaultOption);
    
    // Add each device
    audioInputs.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `Microphone ${index + 1}`;
      micDeviceSelect.appendChild(option);
    });
    
    // Show device selection
    deviceSelectContainer.style.display = 'block';
    
    // Load saved preference
    const stored = await chrome.storage.local.get(['selectedAudioDevice']);
    if (stored.selectedAudioDevice) {
      micDeviceSelect.value = stored.selectedAudioDevice;
      selectedDeviceId = stored.selectedAudioDevice;
    }
    
  } catch (err) {
    console.warn('Could not enumerate devices:', err);
  }
}

// Handle device selection change
if (micDeviceSelect) {
  micDeviceSelect.addEventListener('change', async (e) => {
    selectedDeviceId = e.target.value;
    
    // Save selection immediately  
    try {
      await chrome.storage.local.set({ selectedAudioDevice: selectedDeviceId });
      showStatus('✓ Device selection saved!', 'success');
    } catch (err) {
      console.warn('Could not save device selection:', err);
    }
    
    // Note: We don't test the microphone here anymore - it can cause Chrome issues
    // The actual test will happen when recording starts
  });
}

// Test microphone button (optional explicit test)
const testMicBtn = document.getElementById('test-mic-btn');
if (testMicBtn) {
  testMicBtn.addEventListener('click', async () => {
    testMicBtn.disabled = true;
    testMicBtn.textContent = 'Testing...';
    
    try {
      const constraints = {
        audio: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true
      };
      
      // Use a timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout')), 5000);
      });
      
      const stream = await Promise.race([
        navigator.mediaDevices.getUserMedia(constraints),
        timeoutPromise
      ]);
      
      // Stop immediately
      stream.getTracks().forEach(track => track.stop());
      showStatus('✓ Microphone is working!', 'success');
    } catch (err) {
      console.warn('Mic test error:', err);
      if (err.message === 'Timeout') {
        showStatus('⚠️ Microphone test timed out. Try a different device.', 'info');
      } else {
        showStatus('⚠️ Could not access microphone: ' + (err.message || err.name), 'info');
      }
    } finally {
      testMicBtn.disabled = false;
      testMicBtn.textContent = 'Test Microphone';
    }
  });
}

async function requestMicPermission() {
  enableBtn.disabled = true;
  enableBtn.innerHTML = `
    <svg class="spinner-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"></circle>
    </svg>
    Requesting permission...
  `;
  
  try {
    // Request microphone permission
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Stop the stream immediately - we just needed the permission
    stream.getTracks().forEach(track => track.stop());
    
    // Save permission status
    await chrome.storage.local.set({ 
      micPermissionGranted: true,
      micPermissionTimestamp: Date.now()
    });
    
    showStatus('✓ Microphone access enabled! Select your preferred device below.', 'success');
    enableBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 6L9 17l-5-5"></path>
      </svg>
      Permission Granted
    `;
    enableBtn.classList.add('success');
    instructionsDiv.style.display = 'none';
    
    // Populate device list
    await populateMicrophoneDevices();
    
    // Update skip button
    skipBtn.textContent = 'Done - Close Tab';
    skipBtn.onclick = () => window.close();
    
  } catch (err) {
    console.error('Microphone permission error:', err);
    enableBtn.disabled = false;
    enableBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
      </svg>
      Try Again
    `;
    
    if (err.name === 'NotAllowedError') {
      const errorMsg = (err.message || '').toLowerCase();
      if (errorMsg.includes('dismissed')) {
        showStatus('Permission prompt was dismissed. Please click "Try Again" and then click "Allow" when Chrome asks.', 'info');
      } else {
        showStatus('Microphone access was denied. Please enable it in Chrome settings or try again.', 'error');
        instructionsDiv.style.display = 'block';
      }
    } else if (err.name === 'NotFoundError') {
      showStatus('No microphone found. Please connect a microphone and try again.', 'error');
    } else {
      showStatus(`Error: ${err.message || err.name}`, 'error');
    }
    
    // Save that permission was denied
    await chrome.storage.local.set({ 
      micPermissionGranted: false,
      micPermissionTimestamp: Date.now()
    });
  }
}

async function skipPermission() {
  await chrome.storage.local.set({ 
    micPermissionSkipped: true,
    micPermissionTimestamp: Date.now()
  });
  window.close();
}

enableBtn.addEventListener('click', requestMicPermission);
skipBtn.addEventListener('click', skipPermission);

// Check if we already have permission
async function checkExistingPermission() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(d => d.kind === 'audioinput' && d.label);
    
    if (audioInputs.length > 0) {
      // Already have permission
      showStatus('✓ Microphone access is already enabled! Select your preferred device below.', 'success');
      enableBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 6L9 17l-5-5"></path>
        </svg>
        Already Enabled
      `;
      enableBtn.classList.add('success');
      enableBtn.disabled = true;
      
      await chrome.storage.local.set({ 
        micPermissionGranted: true,
        micPermissionTimestamp: Date.now()
      });
      
      // Populate devices
      await populateMicrophoneDevices();
      
      // Update skip button
      skipBtn.textContent = 'Done - Close Tab';
      skipBtn.onclick = () => window.close();
    }
  } catch (err) {
    // Permission not granted yet - this is fine
  }
}

checkExistingPermission();
