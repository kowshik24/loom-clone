// Video thumbnail generation utility

/**
 * Generate a thumbnail from a video blob
 * @param {Blob} videoBlob - The video blob to generate thumbnail from
 * @returns {Promise<string>} Base64 encoded thumbnail image
 */
async function generateThumbnail(videoBlob) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    
    // Create object URL for the video
    const videoUrl = URL.createObjectURL(videoBlob);
    video.src = videoUrl;
    
    video.addEventListener('loadeddata', () => {
      // Seek to 1 second or 10% of duration, whichever is smaller
      const seekTime = Math.min(1, video.duration * 0.1);
      video.currentTime = seekTime;
    });
    
    video.addEventListener('seeked', () => {
      try {
        // Set canvas dimensions to video dimensions
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // Draw video frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Convert canvas to base64 image (JPEG for smaller size)
        const thumbnail = canvas.toDataURL('image/jpeg', 0.7);
        
        // Cleanup
        URL.revokeObjectURL(videoUrl);
        video.remove();
        canvas.remove();
        
        resolve(thumbnail);
      } catch (error) {
        URL.revokeObjectURL(videoUrl);
        reject(error);
      }
    });
    
    video.addEventListener('error', (e) => {
      URL.revokeObjectURL(videoUrl);
      reject(new Error('Failed to load video for thumbnail generation'));
    });
  });
}

/**
 * Generate a small preview thumbnail (for list views)
 * @param {Blob} videoBlob - The video blob
 * @param {number} maxWidth - Maximum width of thumbnail (default: 160)
 * @param {number} maxHeight - Maximum height of thumbnail (default: 90)
 * @returns {Promise<string>} Base64 encoded thumbnail
 */
async function generateSmallThumbnail(videoBlob, maxWidth = 160, maxHeight = 90) {
  const fullThumbnail = await generateThumbnail(videoBlob);
  
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    img.onload = () => {
      // Calculate scaled dimensions maintaining aspect ratio
      let width = img.width;
      let height = img.height;
      
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      
      if (height > maxHeight) {
        width = (width * maxHeight) / height;
        height = maxHeight;
      }
      
      canvas.width = width;
      canvas.height = height;
      
      ctx.drawImage(img, 0, 0, width, height);
      
      const smallThumbnail = canvas.toDataURL('image/jpeg', 0.7);
      resolve(smallThumbnail);
    };
    
    img.onerror = () => {
      reject(new Error('Failed to resize thumbnail'));
    };
    
    img.src = fullThumbnail;
  });
}
