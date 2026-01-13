// Storage utilities for recording history and state management

/**
 * Save a recording to history
 * @param {Object} recording - Recording metadata
 * @param {string} recording.id - Unique recording ID
 * @param {string} recording.driveLink - Google Drive link
 * @param {string} recording.driveFileId - Google Drive file ID
 * @param {string} recording.title - Recording title
 * @param {string} recording.thumbnail - Base64 thumbnail image
 * @param {number} recording.duration - Recording duration in seconds
 * @param {number} recording.size - File size in bytes
 * @param {string} recording.mode - Recording mode (screen-camera, screen-only, camera-only)
 * @param {number} recording.timestamp - Unix timestamp when recording was created
 */
async function saveRecording(recording) {
    const recordings = await getRecordings();
    recordings.unshift(recording); // Add to beginning of array

    // Keep only last 100 recordings
    if (recordings.length > 100) {
        recordings.splice(100);
    }

    await chrome.storage.local.set({ recordings });
}

/**
 * Get all recordings from history
 * @returns {Promise<Array>} Array of recording objects
 */
async function getRecordings() {
    const result = await chrome.storage.local.get(['recordings']);
    return result.recordings || [];
}

/**
 * Delete a recording from history
 * @param {string} recordingId - ID of recording to delete
 */
async function deleteRecording(recordingId) {
    const recordings = await getRecordings();
    const filtered = recordings.filter(r => r.id !== recordingId);
    await chrome.storage.local.set({ recordings: filtered });
}

/**
 * Update a recording in history
 * @param {string} recordingId - ID of recording to update
 * @param {Object} updates - Fields to update
 */
async function updateRecording(recordingId, updates) {
    const recordings = await getRecordings();
    const index = recordings.findIndex(r => r.id === recordingId);

    if (index !== -1) {
        recordings[index] = { ...recordings[index], ...updates };
        await chrome.storage.local.set({ recordings });
    }
}

/**
 * Save current upload state
 * @param {Object} state - Upload state
 */
async function saveUploadState(state) {
    await chrome.storage.local.set({ currentUpload: state });
}

/**
 * Get current upload state
 * @returns {Promise<Object|null>} Upload state or null
 */
async function getUploadState() {
    const result = await chrome.storage.local.get(['currentUpload']);
    return result.currentUpload || null;
}

/**
 * Clear upload state
 */
async function clearUploadState() {
    await chrome.storage.local.remove(['currentUpload']);
}

/**
 * Get recording by ID
 * @param {string} recordingId - Recording ID
 * @returns {Promise<Object|null>} Recording object or null
 */
async function getRecordingById(recordingId) {
    const recordings = await getRecordings();
    return recordings.find(r => r.id === recordingId) || null;
}

/**
 * Get folder link from storage or create it
 * @returns {Promise<string|null>} Folder link or null
 */
async function getFolderLink() {
    const result = await chrome.storage.local.get(['driveFolderLink']);
    return result.driveFolderLink || null;
}

/**
 * Save folder link to storage
 * @param {string} link - Folder link
 */
async function saveFolderLink(link) {
    await chrome.storage.local.set({ driveFolderLink: link });
}
