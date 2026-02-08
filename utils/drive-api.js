// Google Drive API utilities

// Folder name for storing recordings
const RECORDINGS_FOLDER_NAME = 'my-loom-recordings';

// Create or get the recordings folder
async function getOrCreateRecordingsFolder(token) {
  // First, try to find existing folder
  const searchResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${RECORDINGS_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,webViewLink)`,
    {
      headers: { 'Authorization': 'Bearer ' + token }
    }
  );

  if (!searchResponse.ok) {
    throw new Error('Failed to search for folder');
  }

  const searchData = await searchResponse.json();

  // If folder exists, return its ID and link
  if (searchData.files && searchData.files.length > 0) {
    return {
      id: searchData.files[0].id,
      link: searchData.files[0].webViewLink
    };
  }

  // Folder doesn't exist, create it
  const createResponse = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,webViewLink', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: RECORDINGS_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder'
    })
  });

  if (!createResponse.ok) {
    const error = await createResponse.json();
    throw new Error(error.error?.message || 'Failed to create folder');
  }

  const folderData = await createResponse.json();
  return {
    id: folderData.id,
    link: folderData.webViewLink
  };
}

// Upload video blob to Google Drive
async function uploadToDrive(blob, token, progressCallback = null) {
  // Get or create the recordings folder
  if (progressCallback) progressCallback(10);
  const folderInfo = await getOrCreateRecordingsFolder(token);

  if (progressCallback) progressCallback(20);

  // Determine extension based on blob type
  const isMp4 = blob.type.includes('mp4');
  const extension = isMp4 ? 'mp4' : 'webm';

  const metadata = {
    name: `Screen Recording ${new Date().toLocaleString()}.${extension}`,
    mimeType: blob.type,
    parents: [folderInfo.id] // Upload to the specific folder
  };

  // Use resumable upload for ALL files (more robust)
  if (progressCallback) progressCallback(30);
  return await uploadResumable(blob, metadata, token, progressCallback, folderInfo.link);
}

// Resumable upload for larger files (>5MB)
async function uploadResumable(blob, metadata, token, progressCallback = null, folderLink = null) {
  // Step 1: Initialize resumable upload session
  const initResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': blob.type,
      'X-Upload-Content-Length': blob.size.toString()
    },
    body: JSON.stringify(metadata)
  });

  if (!initResponse.ok) {
    const error = await initResponse.json();
    throw new Error(error.error?.message || 'Failed to initialize upload');
  }

  const uploadUrl = initResponse.headers.get('Location');
  if (!uploadUrl) {
    throw new Error('No upload URL received');
  }

  // Step 2: Upload the file
  if (progressCallback) progressCallback(50);

  // Force binary by using ArrayBuffer view
  console.log('DriveAPI: Preparing upload buffer. Blob type:', blob.type, 'Size:', blob.size);
  const arrayBuf = await blob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuf);

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      // Content-Type should NOT be set here for PUT in resumable upload if it was set in init via X-Upload-Content-Type
      // But some docs say to set it. However, the critical part is NOT setting it to application/json
      // Google Drive API expects strictly the file content.
      // We will set it to the file type just in case, but keep it clean.
      // 'Content-Type': blob.type || 'video/webm',
      'Content-Length': uint8Array.length.toString()
    },
    body: uint8Array
  });

  if (progressCallback) progressCallback(80);

  if (!uploadResponse.ok) {
    const error = await uploadResponse.json();
    throw new Error(error.error?.message || 'Upload failed');
  }

  const data = await uploadResponse.json();

  // Step 3: Make Public
  await fetch(`https://www.googleapis.com/drive/v3/files/${data.id}/permissions`, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ role: 'reader', type: 'anyone' })
  });

  // Return comprehensive info
  return {
    fileId: data.id,
    webViewLink: data.webViewLink,
    folderLink: folderLink
  };
}
