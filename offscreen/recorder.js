// Offscreen document recorder - Handles screen and audio recording

let screenStream = null;
let micStream = null;
let mergedStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let isPaused = false;

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Offscreen: Received message:', request.type, 'toOffscreen:', request.toOffscreen);

  // Only respond to messages explicitly marked for offscreen
  if (request.type === 'START_RECORDING' && request.toOffscreen === true) {
    console.log('Offscreen: Processing START_RECORDING with streamId:', request.streamId);
    startRecording(request.streamId)
      .then(() => {
        console.log('Offscreen: Recording started successfully');
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error('Offscreen: Start recording error:', error.name, error.message);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.type === 'PAUSE_RECORDING' && request.toOffscreen === true) {
    console.log('Offscreen: Processing PAUSE_RECORDING');
    pauseRecording()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error('Offscreen: Pause recording error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.type === 'RESUME_RECORDING' && request.toOffscreen === true) {
    console.log('Offscreen: Processing RESUME_RECORDING');
    resumeRecording()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error('Offscreen: Resume recording error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.type === 'STOP_RECORDING' && request.toOffscreen === true) {
    console.log('Offscreen: Processing STOP_RECORDING');
    stopRecording()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error('Offscreen: Stop recording error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});

// Start recording with stream ID from chrome.desktopCapture
async function startRecording(streamId) {
  if (isRecording) {
    console.log('Already recording');
    return;
  }

  try {
    // 1. Get screen stream using getUserMedia with chromeMed constraints
    console.log('Offscreen: Getting screen stream with ID:', streamId);

    if (!streamId) {
      throw new Error('No stream ID provided from desktopCapture');
    }

    try {
      // Use the legacy getUserMedia API with callback (works better with desktopCapture)
      console.log('Offscreen: Requesting screen stream with streamId...');
      screenStream = await new Promise((resolve, reject) => {
        navigator.webkitGetUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: streamId,
              maxWidth: 1920,
              maxHeight: 1080
            }
          }
        }, resolve, reject);
      });
      console.log('Offscreen: Screen stream obtained successfully!');
      console.log('Offscreen: Video tracks:', screenStream.getVideoTracks().length);
    } catch (err) {
      console.error('Offscreen: getUserMedia (screen) error:', err.name, err.message);
      console.error('Offscreen: Full error:', err);
      console.error('Offscreen: StreamId was:', streamId);
      throw new Error(`Screen capture failed: ${err.name} - ${err.message}. Chrome may not support this stream ID format.`);
    }

    // 2. Get microphone stream (OPTIONAL - if user denies, continue without mic)
    console.log('Offscreen: Requesting microphone...');
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      console.log('Offscreen: Microphone obtained successfully');
    } catch (err) {
      console.warn('Offscreen: Microphone access denied or dismissed:', err.name, err.message);
      console.log('Offscreen: Continuing without microphone audio (this is OK)');
      micStream = null; // Continue without mic - this is not an error!
    }

    // 3. Merge audio tracks (or use screen audio only if no mic)
    console.log('Offscreen: Preparing audio streams...');
    try {
      if (micStream) {
        console.log('Offscreen: Merging screen + microphone audio...');
        mergedStream = await mergeAudioStreams(screenStream, micStream);
        console.log('Offscreen: Streams merged successfully (screen + mic)');
      } else {
        // Use screen stream only (no mic audio)
        console.log('Offscreen: Using screen stream only (no microphone)');
        mergedStream = screenStream;
      }
    } catch (err) {
      console.error('Offscreen: Error merging streams:', err);
      // Fallback to screen only if merge fails
      console.log('Offscreen: Falling back to screen stream only');
      mergedStream = screenStream;
    }

    // 4. Create MediaRecorder
    const options = {
      mimeType: 'video/webm',
      videoBitsPerSecond: 2500000 // 2.5 Mbps
    };

    // Fallback to default if codec not supported
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options.mimeType = 'video/webm';
    }

    mediaRecorder = new MediaRecorder(mergedStream, options);
    recordedChunks = [];

    // Handle data available
    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    // Handle stop
    mediaRecorder.onstop = async () => {
      console.log('Offscreen: MediaRecorder stopped, handling...');
      await handleRecordingStop();
    };

    // Handle errors
    mediaRecorder.onerror = (event) => {
      console.error('MediaRecorder error:', event);
    };

    // Handle stream ended (user stops sharing)
    screenStream.getVideoTracks()[0].onended = () => {
      if (isRecording) {
        stopRecording();
      }
    };

    // Start recording
    mediaRecorder.start(1000); // Collect data every second
    isRecording = true;

    console.log('Recording started');
  } catch (error) {
    console.error('Error starting recording:', error);
    cleanup();
    throw error;
  }
}

// Merge audio streams
async function mergeAudioStreams(screenStream, micStream) {
  const audioContext = new AudioContext();

  // Create video track from screen stream
  const videoTrack = screenStream.getVideoTracks()[0];

  // Get audio tracks
  const screenAudioTracks = screenStream.getAudioTracks();
  const micAudioTracks = micStream.getAudioTracks();

  // Create destination for merged audio
  const destination = audioContext.createMediaStreamDestination();

  // Add screen audio if available
  if (screenAudioTracks.length > 0) {
    const screenSource = audioContext.createMediaStreamSource(
      new MediaStream([screenAudioTracks[0]])
    );
    screenSource.connect(destination);
  }

  // Add microphone audio
  if (micAudioTracks.length > 0) {
    const micSource = audioContext.createMediaStreamSource(
      new MediaStream([micAudioTracks[0]])
    );
    micSource.connect(destination);
  }

  // Combine video track with merged audio
  const mergedStream = new MediaStream();
  mergedStream.addTrack(videoTrack);

  destination.stream.getAudioTracks().forEach(track => {
    mergedStream.addTrack(track);
  });

  return mergedStream;
}

// Pause recording
async function pauseRecording() {
  if (!isRecording || !mediaRecorder || isPaused) {
    return;
  }

  try {
    if (mediaRecorder.state === 'recording') {
      mediaRecorder.pause();
      isPaused = true;
      console.log('Recording paused');
    }
  } catch (error) {
    console.error('Error pausing recording:', error);
    throw error;
  }
}

// Resume recording
async function resumeRecording() {
  if (!isRecording || !mediaRecorder || !isPaused) {
    return;
  }

  try {
    if (mediaRecorder.state === 'paused') {
      mediaRecorder.resume();
      isPaused = false;
      console.log('Recording resumed');
    }
  } catch (error) {
    console.error('Error resuming recording:', error);
    throw error;
  }
}

// Stop recording
async function stopRecording() {
  if (!isRecording || !mediaRecorder) {
    return;
  }

  try {
    if (mediaRecorder.state === 'recording' || mediaRecorder.state === 'paused') {
      mediaRecorder.stop();
    }
    isRecording = false;
    isPaused = false;
  } catch (error) {
    console.error('Error stopping recording:', error);
    cleanup();
    throw error;
  }
}

// Handle recording stop
async function handleRecordingStop() {
  try {
    console.log('Offscreen: handleRecordingStop called, chunks:', recordedChunks.length);

    // Stop all tracks
    cleanup();

    // Create blob from chunks
    const blob = new Blob(recordedChunks, { type: 'video/webm' });

    if (blob.size === 0) {
      console.error('Offscreen: Recording is empty! No chunks recorded');
      throw new Error('Recording is empty');
    }

    console.log('Offscreen: Recording stopped, blob size:', blob.size, 'bytes =', (blob.size / 1024 / 1024).toFixed(2), 'MB');

    // Generate thumbnail
    console.log('Offscreen: Generating thumbnail...');
    let thumbnail = null;
    try {
      thumbnail = await generateThumbnail(blob);
      console.log('Offscreen: Thumbnail generated');
    } catch (e) {
      console.warn('Offscreen: Failed to generate thumbnail:', e);
    }

    // Convert blob to ArrayBuffer for transfer
    console.log('Offscreen: Converting blob to ArrayBuffer...');
    const arrayBuffer = await blob.arrayBuffer();
    console.log('Offscreen: ArrayBuffer created, size:', arrayBuffer.byteLength);

    // Chrome extension message size limit is ~64MB, but we'll use a safer limit
    // For very large files, we might need chunking, but for now we'll try direct transfer
    const maxSize = 50 * 1024 * 1024; // 50MB limit

    if (blob.size > maxSize) {
      console.warn(`Video size (${(blob.size / 1024 / 1024).toFixed(2)}MB) exceeds recommended limit. Upload may fail.`);
    }

    // Send ArrayBuffer to background script
    // Chrome extensions support transferring ArrayBuffers directly via structured clone
    console.log('Offscreen: Sending VIDEO_BLOB message to background...');
    chrome.runtime.sendMessage({
      type: 'VIDEO_BLOB',
      arrayBuffer: arrayBuffer,
      blobSize: blob.size,
      mimeType: blob.type,
      thumbnail: thumbnail
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Offscreen: Error sending video:', chrome.runtime.lastError);
        // Try to notify background of error
        chrome.runtime.sendMessage({
          type: 'RECORDING_ERROR',
          error: `Failed to send video data: ${chrome.runtime.lastError.message}`
        });
      } else if (response && !response.success) {
        console.error('Offscreen: Upload failed:', response.error);
      } else {
        console.log('Offscreen: VIDEO_BLOB sent successfully, response:', response);
      }
    });

  } catch (error) {
    console.error('Error handling recording stop:', error);
    chrome.runtime.sendMessage({
      type: 'RECORDING_ERROR',
      error: error.message
    });
  }
}

// Cleanup resources
function cleanup() {
  // Stop all tracks
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
      // Ignore errors when stopping
    }
  }

  mediaRecorder = null;
  isRecording = false;
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  cleanup();
});

