// Recording History Management Functions - Add to popup.js

// Storage helper functions (mirroring backend utils/storage.js)
async function getRecordings() {
    const result = await chrome.storage.local.get(['recordings']);
    return result.recordings || [];
}

async function getFolderLink() {
    const result = await chrome.storage.local.get(['driveFolderLink']);
    return result.driveFolderLink || null;
}

// Setup recordings UI handlers
function setupRecordingsUI() {
    const viewRecordingsBtn = document.getElementById('view-recordings-btn');
    const backToRecordingBtn = document.getElementById('back-to-recording-btn');
    const viewFolderBtn = document.getElementById('view-folder-btn');
    const newRecordingBtn = document.getElementById('new-recording-btn');

    if (viewRecordingsBtn) {
        viewRecordingsBtn.addEventListener('click', showRecordingsSection);
    }

    if (backToRecordingBtn) {
        backToRecordingBtn.addEventListener('click', () => {
            recordingSection.classList.remove('hidden');
            recordingsSection.classList.add('hidden');
        });
    }

    if (viewFolderBtn) {
        viewFolderBtn.addEventListener('click', async () => {
            const folderLink = await getFolderLink();
            if (folderLink) {
                chrome.tabs.create({ url: folderLink });
            }
        });
    }

    if (newRecordingBtn) {
        newRecordingBtn.addEventListener('click', () => {
            // Clean up any previous recording state
            if (typeof cleanup === 'function') {
                cleanup();
            }
            
            // Use the resetToReadyState function if available
            if (typeof resetToReadyState === 'function') {
                resetToReadyState();
            } else {
                // Fallback: manually reset UI
                const uploadCompleteSection = document.getElementById('upload-complete-section');
                const uploadSection = document.getElementById('upload-section');
                const recordingActiveSection = document.getElementById('recording-active-section');
                const countdownSection = document.getElementById('countdown-section');
                const recordingSection = document.getElementById('recording-section');
                
                uploadCompleteSection?.classList.add('hidden');
                uploadSection?.classList.add('hidden');
                recordingActiveSection?.classList.add('hidden');
                countdownSection?.classList.add('hidden');
                recordingSection?.classList.remove('hidden');
                
                const startBtn = document.getElementById('start-btn');
                if (startBtn) {
                    startBtn.disabled = false;
                }
            }
            
            // Hide any status messages
            const statusDiv = document.getElementById('status');
            if (statusDiv) {
                statusDiv.classList.add('hidden');
            }
            
            console.log('Ready for new recording');
            
            console.log('Ready for new recording');
        });
    }
}

// Show recordings section
async function showRecordingsSection() {
    const recordingsSection = document.getElementById('recordings-section');
    const recordingSection = document.getElementById('recording-section');
    const authSection = document.getElementById('auth-section');

    authSection.classList.add('hidden');
    recordingSection.classList.add('hidden');
    recordingsSection.classList.remove('hidden');

    await loadRecordings();
}

// Load and display recordings
async function loadRecordings() {
    const recordings = await getRecordings();
    const recordingsList = document.getElementById('recordings-list');
    const noRecordings = document.getElementById('no-recordings');

    if (!recordingsList) return;

    recordingsList.innerHTML = '';

    if (recordings.length === 0) {
        noRecordings?.classList.remove('hidden');
        return;
    }

    noRecordings?.classList.add('hidden');

    recordings.forEach(recording => {
        const card = createRecordingCard(recording);
        recordingsList.appendChild(card);
    });
}

// Create recording card element
function createRecordingCard(recording) {
    const card = document.createElement('div');
    card.className = 'recording-card';
    card.dataset.recordingId = recording.id;

    // Thumbnail
    const thumbnail = document.createElement('div');
    thumbnail.className = 'recording-thumbnail';

    if (recording.thumbnail) {
        const img = document.createElement('img');
        img.src = recording.thumbnail;
        img.alt = recording.title;
        thumbnail.appendChild(img);
    } else {
        thumbnail.innerHTML = `
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="10" stroke="white" stroke-width="2" fill="none"/>
        <polygon points="14,11 14,21 22,16" fill="white"/>
      </svg>
    `;
    }

    // Recording info
    const info = document.createElement('div');
    info.className = 'recording-info';

    const title = document.createElement('div');
    title.className = 'recording-title';
    title.textContent = recording.title;

    const meta = document.createElement('div');
    meta.className = 'recording-meta';

    const date = new Date(recording.timestamp);
    const dateStr = date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    });
    const timeStr = date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit'
    });

    const sizeStr = formatFileSize(recording.size);

    meta.innerHTML = `
    <span class="meta-item">
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M6 2V4M14 2V4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M3.5 7.5H16.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M5.5 4H14.5C15.6046 4 16.5 4.89543 16.5 6V15C16.5 16.1046 15.6046 17 14.5 17H5.5C4.39543 17 3.5 16.1046 3.5 15V6C3.5 4.89543 4.39543 4 5.5 4Z" stroke="currentColor" stroke-width="1.6" />
      </svg>
      <span class="meta-text">${dateStr} at ${timeStr}</span>
    </span>
    <span class="meta-sep">•</span>
    <span class="meta-item">
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M6 6.5C6 5.11929 7.11929 4 8.5 4H14C15.1046 4 16 4.89543 16 6V14C16 15.1046 15.1046 16 14 16H8.5C7.11929 16 6 14.8807 6 13.5V6.5Z" stroke="currentColor" stroke-width="1.6"/>
        <path d="M4 8.5C4 7.11929 5.11929 6 6.5 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
      </svg>
      <span class="meta-text">${sizeStr}</span>
    </span>
  `;

    const actions = document.createElement('div');
    actions.className = 'recording-actions';
    actions.innerHTML = `
    <button class="recording-action-btn view-btn" data-link="${recording.driveLink}">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M7 3C4 3 1.5 5.5 1.5 7s2.5 4 5.5 4 5.5-2.5 5.5-4-2.5-4-5.5-4z" stroke="currentColor" fill="none"/>
        <circle cx="7" cy="7" r="2" stroke="currentColor" fill="none"/>
      </svg>
      View
    </button>
    <button class="recording-action-btn copy-btn" data-link="${recording.driveLink}">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="3" y="3" width="8" height="8" rx="1" stroke="currentColor" fill="none"/>
        <path d="M5 3V2a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1h-1" stroke="currentColor" fill="none"/>
      </svg>
      Copy
    </button>
  `;

    info.appendChild(title);
    info.appendChild(meta);
    info.appendChild(actions);

    card.appendChild(thumbnail);
    card.appendChild(info);

    // Event listeners
    actions.querySelector('.view-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (recording.driveLink) chrome.tabs.create({ url: recording.driveLink });
    });

    actions.querySelector('.copy-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        const btn = e.currentTarget;
        try {
            if (!recording.driveLink) return;
            await navigator.clipboard.writeText(recording.driveLink);
            btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M12 4L5.5 10.5L2 7" stroke="currentColor" stroke-width="2" fill="none"/>
        </svg>
        Copied!
      `;
            setTimeout(() => {
                btn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="3" y="3" width="8" height="8" rx="1" stroke="currentColor" fill="none"/>
            <path d="M5 3V2a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1h-1" stroke="currentColor" fill="none"/>
          </svg>
          Copy
        `;
            }, 2000);
        } catch (error) {
            console.error('Failed to copy:', error);
        }
    });

    // Click card to open video
    card.addEventListener('click', () => {
        if (recording.driveLink) chrome.tabs.create({ url: recording.driveLink });
    });

    return card;
}

// Format file size
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Show upload progress section
function showUploadProgress() {
    authSection.classList.add('hidden');
    recordingSection.classList.add('hidden');
    recordingActiveSection.classList.add('hidden');
    uploadSection.classList.remove('hidden');
    uploadCompleteSection.classList.add('hidden');
}
