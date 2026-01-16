// Bunny.net Storage Integration
// Storage Zone: manus-storage
// CDN URL: https://manus.b-cdn.net

const BUNNY_STORAGE_API_KEY = "4c9257d6-aede-4ff1-bb0f9fc95279-997e-412b";
const BUNNY_STORAGE_ZONE = "manus-storage";
const BUNNY_STORAGE_URL = `https://storage.bunnycdn.com/${BUNNY_STORAGE_ZONE}`;
const BUNNY_CDN_URL = "https://manus.b-cdn.net";

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
