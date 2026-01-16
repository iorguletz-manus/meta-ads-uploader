// Bunny.net Storage Integration
// Storage Zone: manus-storage
// CDN URL: https://manus.b-cdn.net

const BUNNY_STORAGE_API_KEY = "4c9257d6-aede-4ff1-bb0f9fc95279-997e-412b";
const BUNNY_STORAGE_ZONE = "manus-storage";
const BUNNY_STORAGE_URL = `https://storage.bunnycdn.com/${BUNNY_STORAGE_ZONE}`;
const BUNNY_CDN_URL = "https://manus.b-cdn.net";

// Bunny Stream (Video Library) Integration
// You need to create a Video Library in Bunny.net dashboard and get these values
const BUNNY_STREAM_API_KEY = process.env.BUNNY_STREAM_API_KEY || "";
const BUNNY_STREAM_LIBRARY_ID = process.env.BUNNY_STREAM_LIBRARY_ID || "";
const BUNNY_STREAM_CDN_HOSTNAME = process.env.BUNNY_STREAM_CDN_HOSTNAME || ""; // e.g., "vz-abc123.b-cdn.net"

// Folder for this app's files
const APP_FOLDER = "meta-ads-uploader";

export interface BunnyUploadResult {
  success: boolean;
  cdnUrl?: string;
  path?: string;
  error?: string;
}

/**
 * Upload a file to Bunny.net Storage
 * @param fileName - Name of the file
 * @param base64Data - Base64 encoded file data (with or without data URL prefix)
 * @param contentType - MIME type of the file
 * @param username - Username for folder organization
 */
export async function uploadToBunny(
  fileName: string,
  base64Data: string,
  contentType: string = "image/jpeg",
  username: string = "default"
): Promise<BunnyUploadResult> {
  try {
    // Remove data URL prefix if present
    const base64Content = base64Data.includes(",")
      ? base64Data.split(",")[1]
      : base64Data;

    // Convert base64 to buffer
    const buffer = Buffer.from(base64Content, "base64");

    // Create folder structure: app/username/year/month/day/filename-timestamp.ext
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const timestamp = Date.now();
    
    // Put timestamp at the end, before extension
    const lastDotIndex = fileName.lastIndexOf('.');
    const nameWithoutExt = lastDotIndex > 0 ? fileName.substring(0, lastDotIndex) : fileName;
    const ext = lastDotIndex > 0 ? fileName.substring(lastDotIndex) : '';
    const uniqueFileName = `${nameWithoutExt}-${timestamp}${ext}`;
    const filePath = `${APP_FOLDER}/${username}/${year}/${month}/${day}/${uniqueFileName}`;

    // Upload to Bunny.net
    const response = await fetch(`${BUNNY_STORAGE_URL}/${filePath}`, {
      method: "PUT",
      headers: {
        AccessKey: BUNNY_STORAGE_API_KEY,
        "Content-Type": contentType,
      },
      body: new Uint8Array(buffer),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Bunny] Upload failed:", response.status, errorText);
      return {
        success: false,
        error: `Upload failed: ${response.status} ${errorText}`,
      };
    }

    const cdnUrl = `${BUNNY_CDN_URL}/${filePath}`;
    console.log(`[Bunny] Uploaded successfully: ${cdnUrl}`);

    return {
      success: true,
      cdnUrl,
      path: filePath,
    };
  } catch (error) {
    console.error("[Bunny] Upload error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Upload a file to Bunny.net Storage from raw buffer (for large files)
 * @param fileName - Name of the file
 * @param buffer - Raw file buffer
 * @param contentType - MIME type of the file
 * @param username - Username for folder organization
 */
export async function uploadBufferToBunny(
  fileName: string,
  buffer: Buffer,
  contentType: string = "video/mp4",
  username: string = "default"
): Promise<BunnyUploadResult> {
  try {
    // Create folder structure: app/username/year/month/day/filename-timestamp.ext
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const timestamp = Date.now();
    
    // Put timestamp at the end, before extension
    const lastDotIndex = fileName.lastIndexOf('.');
    const nameWithoutExt = lastDotIndex > 0 ? fileName.substring(0, lastDotIndex) : fileName;
    const ext = lastDotIndex > 0 ? fileName.substring(lastDotIndex) : '';
    const uniqueFileName = `${nameWithoutExt}-${timestamp}${ext}`;
    const filePath = `${APP_FOLDER}/${username}/${year}/${month}/${day}/${uniqueFileName}`;

    console.log(`[Bunny] Uploading buffer: ${fileName} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);

    // Upload to Bunny.net
    const response = await fetch(`${BUNNY_STORAGE_URL}/${filePath}`, {
      method: "PUT",
      headers: {
        AccessKey: BUNNY_STORAGE_API_KEY,
        "Content-Type": contentType,
      },
      body: new Uint8Array(buffer),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Bunny] Upload failed:", response.status, errorText);
      return {
        success: false,
        error: `Upload failed: ${response.status} ${errorText}`,
      };
    }

    const cdnUrl = `${BUNNY_CDN_URL}/${filePath}`;
    console.log(`[Bunny] Uploaded successfully: ${cdnUrl}`);

    return {
      success: true,
      cdnUrl,
      path: filePath,
    };
  } catch (error) {
    console.error("[Bunny] Upload error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Delete a file from Bunny.net Storage
 * @param filePath - Path to the file (including app folder)
 */
export async function deleteFromBunny(filePath: string): Promise<boolean> {
  try {
    const response = await fetch(`${BUNNY_STORAGE_URL}/${filePath}`, {
      method: "DELETE",
      headers: {
        AccessKey: BUNNY_STORAGE_API_KEY,
      },
    });

    if (!response.ok) {
      console.error("[Bunny] Delete failed:", response.status);
      return false;
    }

    console.log(`[Bunny] Deleted successfully: ${filePath}`);
    return true;
  } catch (error) {
    console.error("[Bunny] Delete error:", error);
    return false;
  }
}

/**
 * List files in the app folder
 */
export async function listBunnyFiles(): Promise<string[]> {
  try {
    const response = await fetch(`${BUNNY_STORAGE_URL}/${APP_FOLDER}/`, {
      method: "GET",
      headers: {
        AccessKey: BUNNY_STORAGE_API_KEY,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.error("[Bunny] List failed:", response.status);
      return [];
    }

    const files = await response.json();
    return files.map((f: { ObjectName: string }) => f.ObjectName);
  } catch (error) {
    console.error("[Bunny] List error:", error);
    return [];
  }
}


// ============================================
// Bunny Stream (Video Library) Functions
// ============================================

export interface BunnyStreamFetchResult {
  success: boolean;
  videoId?: string;
  videoGuid?: string;
  title?: string;
  status?: number; // 0=created, 1=uploaded, 2=processing, 3=transcoding, 4=finished, 5=error
  error?: string;
}

export interface BunnyStreamVideoStatus {
  guid: string;
  title: string;
  status: number; // 0=created, 1=uploaded, 2=processing, 3=transcoding, 4=finished, 5=error
  thumbnailUrl?: string;
  directPlayUrl?: string;
  hlsUrl?: string;
  length?: number;
  width?: number;
  height?: number;
}

/**
 * Fetch a video from URL using Bunny Stream's videos/fetch endpoint
 * Bunny will download the video directly from the source URL
 * @param sourceUrl - Direct download URL (e.g., Google Drive export URL)
 * @param title - Title for the video in Bunny Stream
 */
export async function bunnyStreamFetchVideo(
  sourceUrl: string,
  title: string
): Promise<BunnyStreamFetchResult> {
  if (!BUNNY_STREAM_API_KEY || !BUNNY_STREAM_LIBRARY_ID) {
    return {
      success: false,
      error: "Bunny Stream credentials not configured. Set BUNNY_STREAM_API_KEY and BUNNY_STREAM_LIBRARY_ID environment variables.",
    };
  }

  try {
    console.log(`[BunnyStream] Fetching video from URL: ${sourceUrl}`);
    console.log(`[BunnyStream] Title: ${title}`);

    const response = await fetch(
      `https://video.bunnycdn.com/library/${BUNNY_STREAM_LIBRARY_ID}/videos/fetch`,
      {
        method: "POST",
        headers: {
          AccessKey: BUNNY_STREAM_API_KEY,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: sourceUrl,
          title: title,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("[BunnyStream] Fetch failed:", response.status, data);
      return {
        success: false,
        error: data.message || `Fetch failed: ${response.status}`,
      };
    }

    console.log(`[BunnyStream] Video fetch initiated:`, data);

    return {
      success: true,
      videoId: data.id?.toString(),
      videoGuid: data.guid,
      title: data.title,
      status: data.status,
    };
  } catch (error) {
    console.error("[BunnyStream] Fetch error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get video status from Bunny Stream
 * @param videoGuid - The GUID of the video
 */
export async function bunnyStreamGetVideoStatus(
  videoGuid: string
): Promise<BunnyStreamVideoStatus | null> {
  if (!BUNNY_STREAM_API_KEY || !BUNNY_STREAM_LIBRARY_ID) {
    console.error("[BunnyStream] Credentials not configured");
    return null;
  }

  try {
    const response = await fetch(
      `https://video.bunnycdn.com/library/${BUNNY_STREAM_LIBRARY_ID}/videos/${videoGuid}`,
      {
        method: "GET",
        headers: {
          AccessKey: BUNNY_STREAM_API_KEY,
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      console.error("[BunnyStream] Get status failed:", response.status);
      return null;
    }

    const data = await response.json();
    
    // Build URLs
    const thumbnailUrl = data.thumbnailFileName 
      ? `https://${BUNNY_STREAM_CDN_HOSTNAME}/${videoGuid}/${data.thumbnailFileName}`
      : undefined;
    
    const directPlayUrl = `https://${BUNNY_STREAM_CDN_HOSTNAME}/${videoGuid}/play.mp4`;
    const hlsUrl = `https://${BUNNY_STREAM_CDN_HOSTNAME}/${videoGuid}/playlist.m3u8`;

    return {
      guid: data.guid,
      title: data.title,
      status: data.status,
      thumbnailUrl,
      directPlayUrl,
      hlsUrl,
      length: data.length,
      width: data.width,
      height: data.height,
    };
  } catch (error) {
    console.error("[BunnyStream] Get status error:", error);
    return null;
  }
}

/**
 * Wait for video to finish processing
 * @param videoGuid - The GUID of the video
 * @param maxAttempts - Maximum polling attempts (default 30 = ~60 seconds)
 * @param delayMs - Delay between attempts in ms (default 2000)
 */
export async function bunnyStreamWaitForVideo(
  videoGuid: string,
  maxAttempts: number = 30,
  delayMs: number = 2000
): Promise<BunnyStreamVideoStatus | null> {
  console.log(`[BunnyStream] Waiting for video ${videoGuid} to finish processing...`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const status = await bunnyStreamGetVideoStatus(videoGuid);
    
    if (!status) {
      console.error(`[BunnyStream] Failed to get status for ${videoGuid}`);
      return null;
    }

    console.log(`[BunnyStream] Attempt ${attempt}/${maxAttempts} - Status: ${status.status} (${getStatusName(status.status)})`);

    // Status 4 = finished, 5 = error
    if (status.status === 4) {
      console.log(`[BunnyStream] Video ${videoGuid} finished processing!`);
      return status;
    }

    if (status.status === 5) {
      console.error(`[BunnyStream] Video ${videoGuid} processing failed`);
      return null;
    }

    // Wait before next attempt
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  console.warn(`[BunnyStream] Timeout waiting for video ${videoGuid}`);
  return null;
}

function getStatusName(status: number): string {
  const statusNames: { [key: number]: string } = {
    0: "created",
    1: "uploaded",
    2: "processing",
    3: "transcoding",
    4: "finished",
    5: "error",
  };
  return statusNames[status] || "unknown";
}

/**
 * Check if Bunny Stream is configured
 */
export function isBunnyStreamConfigured(): boolean {
  return !!(BUNNY_STREAM_API_KEY && BUNNY_STREAM_LIBRARY_ID && BUNNY_STREAM_CDN_HOSTNAME);
}
