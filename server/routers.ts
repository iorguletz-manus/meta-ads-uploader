import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { saveFacebookToken, getFacebookToken, clearFacebookToken, saveAdAccountSettings, getAdAccountSettings, saveGoogleToken, getGoogleToken, clearGoogleToken, refreshGoogleAccessToken } from "./db";
import { adPresets } from "../drizzle/schema";
import { getDb } from "./db";
import { eq, and } from "drizzle-orm";
import { uploadToBunny, deleteFromBunny, uploadBufferToBunny, bunnyStreamFetchVideo, bunnyStreamWaitForVideo, isBunnyStreamConfigured } from "./bunnyStorage";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { SignJWT } from "jose";
import { ENV } from "./_core/env";

// Fixed credentials - single account
const FIXED_USERNAME = "iorguletz";
const FIXED_PASSWORD = "cinema10";

// Meta API base URL
const META_API_BASE = "https://graph.facebook.com/v24.0";

// Helper to wait for video processing and get thumbnail URL from Meta
async function getVideoThumbnailUrl(videoId: string, accessToken: string): Promise<string | null> {
  const maxAttempts = 5; // Max 5 attempts (about 10 seconds) - video should be ready by Step 4
  const delayMs = 2000; // 2 seconds between attempts
  
  try {
    console.log(`[getVideoThumbnail] Waiting for video ${videoId} to be processed...`);
    
    // First, wait for video to be ready
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const statusResponse = await fetch(
        `${META_API_BASE}/${videoId}?fields=status,picture,thumbnails&access_token=${accessToken}`
      );
      const statusData = await statusResponse.json();
      
      if (statusData.error) {
        console.error(`[getVideoThumbnail] Error checking status:`, statusData.error.message);
        return null;
      }
      
      const status = statusData.status?.video_status || statusData.status;
      console.log(`[getVideoThumbnail] Attempt ${attempt}/${maxAttempts} - Status: ${status}`);
      
      // Check if video is ready
      if (status === 'ready' || status === 'complete') {
        // Try to get best thumbnail
        // First try thumbnails array for best quality
        if (statusData.thumbnails?.data?.length > 0) {
          // Get the largest thumbnail
          const thumbnails = statusData.thumbnails.data;
          const bestThumb = thumbnails.reduce((best: any, curr: any) => {
            const bestSize = (best.width || 0) * (best.height || 0);
            const currSize = (curr.width || 0) * (curr.height || 0);
            return currSize > bestSize ? curr : best;
          }, thumbnails[0]);
          
          if (bestThumb?.uri) {
            console.log(`[getVideoThumbnail] Got high-quality thumbnail:`, bestThumb.uri);
            return bestThumb.uri;
          }
        }
        
        // Fallback to picture field
        if (statusData.picture) {
          console.log(`[getVideoThumbnail] Got thumbnail URL:`, statusData.picture);
          return statusData.picture;
        }
        
        console.log(`[getVideoThumbnail] Video ready but no thumbnail found`);
        return null;
      }
      
      // If still processing, wait and retry
      if (status === 'processing' || status === 'uploading' || !status) {
        console.log(`[getVideoThumbnail] Video still processing, waiting ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      
      // If error status, stop trying
      if (status === 'error' || status === 'failed') {
        console.error(`[getVideoThumbnail] Video processing failed with status: ${status}`);
        return null;
      }
    }
    
    console.warn(`[getVideoThumbnail] Timeout waiting for video to be ready after ${maxAttempts} attempts`);
    return null;
  } catch (error: any) {
    console.error(`[getVideoThumbnail] Failed:`, error.message);
    return null;
  }
}

// Facebook App credentials (from ENV)
const FB_APP_ID = process.env.VITE_FACEBOOK_APP_ID;
const FB_APP_SECRET = process.env.FACEBOOK_APP_SECRET;

// Exchange short-lived token for long-lived token (60 days)
async function exchangeForLongLivedToken(shortLivedToken: string): Promise<{ accessToken: string; expiresIn: number }> {
  if (!FB_APP_ID || !FB_APP_SECRET) {
    console.log("[exchangeToken] FB_APP_ID or FB_APP_SECRET not set, returning original token");
    return { accessToken: shortLivedToken, expiresIn: 3600 }; // Return original if no app secret
  }
  
  try {
    const url = `https://graph.facebook.com/v24.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${FB_APP_ID}&client_secret=${FB_APP_SECRET}&fb_exchange_token=${shortLivedToken}`;
    
    console.log("[exchangeToken] Exchanging for long-lived token...");
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.error) {
      console.error("[exchangeToken] Error:", data.error.message);
      return { accessToken: shortLivedToken, expiresIn: 3600 };
    }
    
    console.log("[exchangeToken] Success! Token expires in:", data.expires_in, "seconds (", Math.round(data.expires_in / 86400), "days)");
    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in || 5184000 // Default 60 days in seconds
    };
  } catch (error) {
    console.error("[exchangeToken] Failed:", error);
    return { accessToken: shortLivedToken, expiresIn: 3600 };
  }
}

// Helper to make Meta API requests
async function metaApiRequest(endpoint: string, accessToken: string, options: RequestInit = {}) {
  const url = `${META_API_BASE}${endpoint}${endpoint.includes("?") ? "&" : "?"}access_token=${accessToken}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Meta API request failed");
  }
  
  return response.json();
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    login: publicProcedure
      .input(z.object({ username: z.string(), password: z.string() }))
      .mutation(async ({ input, ctx }) => {
        // Validate against fixed credentials
        if (input.username !== FIXED_USERNAME || input.password !== FIXED_PASSWORD) {
          throw new Error("Invalid username or password");
        }
        
        // Create JWT token using SDK's session format
        const secret = new TextEncoder().encode(ENV.cookieSecret);
        const token = await new SignJWT({ 
          openId: "fixed-user-id",
          appId: ENV.appId,
          name: FIXED_USERNAME,
        })
          .setProtectedHeader({ alg: "HS256", typ: "JWT" })
          .setIssuedAt()
          .setExpirationTime("7d")
          .sign(secret);
        
        // Set cookie
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, {
          ...cookieOptions,
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });
        
        return { 
          success: true,
          user: { name: FIXED_USERNAME }
        };
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  meta: router({
    // Save Facebook token to database (with automatic exchange to long-lived)
    saveFacebookToken: protectedProcedure
      .input(z.object({ accessToken: z.string(), expiresIn: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        console.log("[saveFacebookToken] Received token, attempting to exchange for long-lived...");
        
        // Exchange for long-lived token (60 days)
        const longLived = await exchangeForLongLivedToken(input.accessToken);
        
        console.log("[saveFacebookToken] Saving long-lived token for openId:", ctx.user.openId);
        await saveFacebookToken(ctx.user.openId, longLived.accessToken, longLived.expiresIn);
        console.log("[saveFacebookToken] Long-lived token saved successfully");
        
        return { 
          success: true,
          accessToken: longLived.accessToken,
          expiresIn: longLived.expiresIn
        };
      }),

    // Get saved Facebook token from database
    getSavedToken: protectedProcedure
      .query(async ({ ctx }) => {
        if (!ctx.user) {
          console.log("[getSavedToken] No user in context");
          return null;
        }
        console.log("[getSavedToken] Getting token for openId:", ctx.user.openId);
        const token = await getFacebookToken(ctx.user.openId);
        console.log("[getSavedToken] Token found:", token ? "yes" : "no");
        return token;
      }),

    // Clear Facebook token from database
    clearToken: protectedProcedure
      .mutation(async ({ ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        await clearFacebookToken(ctx.user.openId);
        return { success: true };
      }),

    // Save ad account settings
    saveAdAccountSettings: protectedProcedure
      .input(z.object({ 
        selectedAdAccountId: z.string().nullable(), 
        enabledAdAccountIds: z.array(z.string()) 
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        await saveAdAccountSettings(ctx.user.openId, input.selectedAdAccountId, input.enabledAdAccountIds);
        return { success: true };
      }),

    // Get ad account settings
    getAdAccountSettings: protectedProcedure
      .query(async ({ ctx }) => {
        if (!ctx.user) return null;
        return await getAdAccountSettings(ctx.user.openId);
      }),

    // Upload media to Bunny.net CDN
    uploadToBunny: protectedProcedure
      .input(z.object({
        fileName: z.string(),
        base64Data: z.string(),
        contentType: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Use username from context or default
        const username = ctx.user?.name || "default";
        const result = await uploadToBunny(
          input.fileName,
          input.base64Data,
          input.contentType || "image/jpeg",
          username
        );
        if (!result.success) {
          throw new Error(result.error || "Upload failed");
        }
        return { cdnUrl: result.cdnUrl, path: result.path };
      }),

    // Delete media from Bunny.net CDN (BACKUP - kept for future use)
    deleteFromBunny: protectedProcedure
      .input(z.object({ filePath: z.string() }))
      .mutation(async ({ input }) => {
        const success = await deleteFromBunny(input.filePath);
        return { success };
      }),

    // Upload image directly to Meta API (returns image hash)
    uploadImageToMeta: protectedProcedure
      .input(z.object({
        accessToken: z.string(),
        adAccountId: z.string(),
        base64Data: z.string(),
        fileName: z.string(),
      }))
      .mutation(async ({ input }) => {
        console.log("[uploadImageToMeta] Starting upload for:", input.fileName);
        
        try {
          // Create form data for image upload
          const formData = new FormData();
          
          // Convert base64 to buffer
          const base64Clean = input.base64Data.replace(/^data:image\/\w+;base64,/, "");
          const buffer = Buffer.from(base64Clean, "base64");
          const blob = new Blob([buffer], { type: "image/jpeg" });
          
          formData.append("filename", input.fileName);
          formData.append("source", blob, input.fileName);
          formData.append("access_token", input.accessToken);
          
          const response = await fetch(
            `${META_API_BASE}/${input.adAccountId}/adimages`,
            {
              method: "POST",
              body: formData,
            }
          );
          
          const data = await response.json();
          
          if (data.error) {
            console.error("[uploadImageToMeta] Error:", data.error);
            throw new Error(data.error.message || "Failed to upload image to Meta");
          }
          
          // Extract hash from response
          const images = data.images || {};
          const imageKey = Object.keys(images)[0];
          const imageHash = images[imageKey]?.hash;
          
          if (!imageHash) {
            throw new Error("No image hash returned from Meta");
          }
          
          console.log("[uploadImageToMeta] Success! Hash:", imageHash);
          return { 
            success: true, 
            hash: imageHash,
            fileName: input.fileName 
          };
        } catch (error: any) {
          console.error("[uploadImageToMeta] Failed:", error.message);
          throw new Error(error.message || "Failed to upload image to Meta");
        }
      }),

    // Upload video directly to Meta API (returns video ID)
    uploadVideoToMeta: protectedProcedure
      .input(z.object({
        accessToken: z.string(),
        adAccountId: z.string(),
        base64Data: z.string(),
        fileName: z.string(),
      }))
      .mutation(async ({ input }) => {
        console.log("[uploadVideoToMeta] Starting upload for:", input.fileName);
        
        try {
          // Convert base64 to buffer
          const base64Clean = input.base64Data.replace(/^data:video\/\w+;base64,/, "");
          const buffer = Buffer.from(base64Clean, "base64");
          const blob = new Blob([buffer], { type: "video/mp4" });
          
          // Create form data for video upload
          const formData = new FormData();
          formData.append("title", input.fileName);
          formData.append("source", blob, input.fileName);
          formData.append("access_token", input.accessToken);
          
          const response = await fetch(
            `${META_API_BASE}/${input.adAccountId}/advideos`,
            {
              method: "POST",
              body: formData,
            }
          );
          
          const data = await response.json();
          
          if (data.error) {
            console.error("[uploadVideoToMeta] Error:", data.error);
            throw new Error(data.error.message || "Failed to upload video to Meta");
          }
          
          if (!data.id) {
            throw new Error("No video ID returned from Meta");
          }
          
          console.log("[uploadVideoToMeta] Success! Video ID:", data.id);
          
          // Don't wait for thumbnail here - it will be fetched in Step 4 (PUBLISH)
          // Meta processes video in background, thumbnail will be ready by the time user clicks PUBLISH
          console.log("[uploadVideoToMeta] Skipping thumbnail wait - will fetch in Step 4");
          
          return { 
            success: true, 
            videoId: data.id,
            thumbnailUrl: undefined, // Will be fetched in Step 4
            fileName: input.fileName 
          };
        } catch (error: any) {
          console.error("[uploadVideoToMeta] Failed:", error.message);
          throw new Error(error.message || "Failed to upload video to Meta");
        }
      }),

    // Download from public Google Drive and upload to Bunny CDN
    importFromPublicGoogleDrive: protectedProcedure
      .input(z.object({
        fileId: z.string(),
        bunnyStorageZone: z.string(),
        bunnyApiKey: z.string(),
        bunnyPullZone: z.string(),
      }))
      .mutation(async ({ input }) => {
        console.log("\n" + "=".repeat(80));
        console.log("[importFromPublicGoogleDrive] ====== START ======");
        console.log("[importFromPublicGoogleDrive] FileId:", input.fileId);
        
        try {
          // Step 1: Get file metadata from Google Drive
          const metadataUrl = `https://www.googleapis.com/drive/v3/files/${input.fileId}?fields=name,mimeType,size&key=${process.env.VITE_GOOGLE_API_KEY}`;
          console.log("[importFromPublicGoogleDrive] Step 1: Getting metadata...");
          
          const metadataResponse = await fetch(metadataUrl);
          if (!metadataResponse.ok) {
            const errorText = await metadataResponse.text();
            console.error("[importFromPublicGoogleDrive] Metadata error:", errorText);
            throw new Error(`Failed to get file metadata: ${metadataResponse.status}. Make sure the file is publicly shared.`);
          }
          
          const metadata = await metadataResponse.json();
          console.log("[importFromPublicGoogleDrive] Metadata:", metadata);
          
          // Step 2: Download file content from Google Drive
          const downloadUrl = `https://www.googleapis.com/drive/v3/files/${input.fileId}?alt=media&key=${process.env.VITE_GOOGLE_API_KEY}`;
          console.log("[importFromPublicGoogleDrive] Step 2: Downloading from Google Drive...");
          
          const downloadResponse = await fetch(downloadUrl);
          if (!downloadResponse.ok) {
            throw new Error(`Failed to download file: ${downloadResponse.status}`);
          }
          
          const arrayBuffer = await downloadResponse.arrayBuffer();
          const fileBuffer = Buffer.from(arrayBuffer);
          console.log("[importFromPublicGoogleDrive] Downloaded:", fileBuffer.length, "bytes");
          
          // Step 3: Generate unique filename for Bunny
          const timestamp = Date.now();
          const randomSuffix = Math.random().toString(36).substring(2, 8);
          const extension = metadata.name.split('.').pop() || 'mp4';
          const bunnyFileName = `gdrive_${timestamp}_${randomSuffix}.${extension}`;
          
          // Step 4: Upload to Bunny CDN
          console.log("[importFromPublicGoogleDrive] Step 3: Uploading to Bunny CDN...");
          const bunnyUploadUrl = `https://storage.bunnycdn.com/${input.bunnyStorageZone}/${bunnyFileName}`;
          
          const bunnyResponse = await fetch(bunnyUploadUrl, {
            method: 'PUT',
            headers: {
              'AccessKey': input.bunnyApiKey,
              'Content-Type': metadata.mimeType,
            },
            body: fileBuffer,
          });
          
          if (!bunnyResponse.ok) {
            const errorText = await bunnyResponse.text();
            console.error("[importFromPublicGoogleDrive] Bunny error:", errorText);
            throw new Error(`Failed to upload to Bunny: ${bunnyResponse.status}`);
          }
          
          const bunnyUrl = `https://${input.bunnyPullZone}.b-cdn.net/${bunnyFileName}`;
          
          console.log("[importFromPublicGoogleDrive] ====== SUCCESS ======");
          console.log("[importFromPublicGoogleDrive] Bunny URL:", bunnyUrl);
          console.log("=".repeat(80) + "\n");
          
          return {
            success: true,
            fileName: metadata.name,
            mimeType: metadata.mimeType,
            size: fileBuffer.length,
            bunnyUrl,
            bunnyFileName,
          };
        } catch (error: any) {
          console.error("[importFromPublicGoogleDrive] ====== FAILED ======");
          console.error("[importFromPublicGoogleDrive] Error:", error.message);
          console.log("=".repeat(80) + "\n");
          throw new Error(error.message || "Failed to import from Google Drive");
        }
      }),

    // Upload from Google Drive URL directly to Meta (server-side)
    uploadFromGoogleDriveToMeta: protectedProcedure
      .input(z.object({
        accessToken: z.string(),
        adAccountId: z.string(),
        googleAccessToken: z.string(),
        fileId: z.string(),
        fileName: z.string(),
        mimeType: z.string(),
      }))
      .mutation(async ({ input }) => {
        const startTime = Date.now();
        console.log("\n" + "=".repeat(80));
        console.log("[uploadFromGoogleDrive] ====== START (file_url method) ======");
        console.log("[uploadFromGoogleDrive] Timestamp:", new Date().toISOString());
        console.log("[uploadFromGoogleDrive] File:", input.fileName);
        console.log("[uploadFromGoogleDrive] MimeType:", input.mimeType);
        console.log("[uploadFromGoogleDrive] FileId:", input.fileId);
        console.log("[uploadFromGoogleDrive] AdAccountId:", input.adAccountId);
        
        const isVideo = input.mimeType.startsWith("video/");
        let permissionId: string | null = null;
        
        try {
          // Step 1: Make file temporarily public
          console.log("[uploadFromGoogleDrive] Step 1: Making file temporarily public...");
          
          const permissionResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files/${input.fileId}/permissions`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${input.googleAccessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                role: "reader",
                type: "anyone",
              }),
            }
          );
          
          if (!permissionResponse.ok) {
            const errorText = await permissionResponse.text();
            console.error("[uploadFromGoogleDrive] Failed to create public permission:", errorText);
            throw new Error(`Failed to make file public: ${permissionResponse.status}`);
          }
          
          const permissionData = await permissionResponse.json();
          permissionId = permissionData.id;
          console.log("[uploadFromGoogleDrive] - Permission created, ID:", permissionId);
          
          // Step 2: Get the public download URL
          // Google Drive direct download URL format
          const publicUrl = `https://drive.google.com/uc?export=download&id=${input.fileId}`;
          console.log("[uploadFromGoogleDrive] Step 2: Public URL generated:", publicUrl);
          
          // Step 3: Upload to Meta using file_url
          const endpoint = isVideo 
            ? `${META_API_BASE}/${input.adAccountId}/advideos`
            : `${META_API_BASE}/${input.adAccountId}/adimages`;
          
          console.log("[uploadFromGoogleDrive] Step 3: Uploading to Meta via file_url");
          console.log("[uploadFromGoogleDrive] - Type:", isVideo ? "VIDEO" : "IMAGE");
          console.log("[uploadFromGoogleDrive] - Endpoint:", endpoint);
          
          const uploadStartTime = Date.now();
          
          // Use URLSearchParams for form data
          const formData = new URLSearchParams();
          formData.append("access_token", input.accessToken);
          formData.append("file_url", publicUrl);
          if (isVideo) {
            formData.append("title", input.fileName);
          } else {
            formData.append("name", input.fileName);
          }
          
          const metaResponse = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: formData.toString(),
          });
          
          const uploadTime = Date.now() - uploadStartTime;
          console.log("[uploadFromGoogleDrive] - Meta response time:", uploadTime, "ms");
          
          const data = await metaResponse.json();
          
          console.log("[uploadFromGoogleDrive] Step 4: Meta response received");
          console.log("[uploadFromGoogleDrive] - Status:", metaResponse.status);
          console.log("[uploadFromGoogleDrive] - Response:", JSON.stringify(data, null, 2));
          
          if (data.error) {
            console.error("[uploadFromGoogleDrive] Meta API Error:", data.error.message);
            throw new Error(data.error.error_user_msg || data.error.message || "Failed to upload to Meta");
          }
          
          const totalTime = Date.now() - startTime;
          
          // Step 5: Remove public permission (cleanup)
          console.log("[uploadFromGoogleDrive] Step 5: Removing public permission...");
          if (permissionId) {
            try {
              await fetch(
                `https://www.googleapis.com/drive/v3/files/${input.fileId}/permissions/${permissionId}`,
                {
                  method: "DELETE",
                  headers: {
                    Authorization: `Bearer ${input.googleAccessToken}`,
                  },
                }
              );
              console.log("[uploadFromGoogleDrive] - Permission removed successfully");
              permissionId = null; // Mark as cleaned up
            } catch (cleanupError) {
              console.warn("[uploadFromGoogleDrive] - Failed to remove permission (non-critical):", cleanupError);
            }
          }
          
          if (isVideo) {
            console.log("[uploadFromGoogleDrive] ====== SUCCESS ======");
            console.log("[uploadFromGoogleDrive] Video uploaded! ID:", data.id);
            console.log("[uploadFromGoogleDrive] Total time:", totalTime, "ms (", Math.round(totalTime / 1000), "s)");
            
            // Don't wait for thumbnail here - it will be fetched in Step 4 (PUBLISH)
            console.log("[uploadFromGoogleDrive] Skipping thumbnail wait - will fetch in Step 4");
            console.log("=".repeat(80) + "\n");
            return { 
              success: true, 
              videoId: data.id,
              thumbnailUrl: undefined, // Will be fetched in Step 4
              fileName: input.fileName,
              type: "video" as const
            };
          } else {
            const images = data.images || {};
            const imageKey = Object.keys(images)[0];
            const imageHash = images[imageKey]?.hash;
            
            console.log("[uploadFromGoogleDrive] ====== SUCCESS ======");
            console.log("[uploadFromGoogleDrive] Image uploaded! Hash:", imageHash);
            console.log("[uploadFromGoogleDrive] Total time:", totalTime, "ms (", Math.round(totalTime / 1000), "s)");
            console.log("=".repeat(80) + "\n");
            return { 
              success: true, 
              hash: imageHash,
              fileName: input.fileName,
              type: "image" as const
            };
          }
        } catch (error: any) {
          const totalTime = Date.now() - startTime;
          console.error("[uploadFromGoogleDrive] ====== FAILED ======");
          console.error("[uploadFromGoogleDrive] Error:", error.message);
          console.error("[uploadFromGoogleDrive] Total time before failure:", totalTime, "ms");
          
          // Cleanup: try to remove public permission even on error
          if (permissionId) {
            try {
              console.log("[uploadFromGoogleDrive] Cleanup: Removing public permission after error...");
              await fetch(
                `https://www.googleapis.com/drive/v3/files/${input.fileId}/permissions/${permissionId}`,
                {
                  method: "DELETE",
                  headers: {
                    Authorization: `Bearer ${input.googleAccessToken}`,
                  },
                }
              );
              console.log("[uploadFromGoogleDrive] - Permission removed");
            } catch (cleanupError) {
              console.warn("[uploadFromGoogleDrive] - Failed to remove permission during cleanup");
            }
          }
          
          console.error("=".repeat(80) + "\n");
          throw new Error(error.message || "Failed to upload from Google Drive to Meta");
        }
      }),

    // Upload from public URL directly to Meta (for public Google Drive folders)
    uploadFromPublicUrl: protectedProcedure
      .input(z.object({
        accessToken: z.string(),
        adAccountId: z.string(),
        fileUrl: z.string(),
        fileName: z.string(),
        isVideo: z.boolean(),
      }))
      .mutation(async ({ input }) => {
        const startTime = Date.now();
        console.log("\n" + "=".repeat(80));
        console.log("[uploadFromPublicUrl] ====== START ======");
        console.log("[uploadFromPublicUrl] File:", input.fileName);
        console.log("[uploadFromPublicUrl] URL:", input.fileUrl);
        console.log("[uploadFromPublicUrl] Is video:", input.isVideo);
        
        try {
          const adAccountId = input.adAccountId.replace('act_', '');
          
          if (input.isVideo) {
            // Upload video using file_url parameter
            console.log("[uploadFromPublicUrl] Uploading video via file_url...");
            
            const formData = new FormData();
            formData.append('access_token', input.accessToken);
            formData.append('file_url', input.fileUrl);
            formData.append('title', input.fileName);
            
            const uploadResponse = await fetch(
              `${META_API_BASE}/act_${adAccountId}/advideos`,
              {
                method: 'POST',
                body: formData,
              }
            );
            
            const data = await uploadResponse.json();
            const totalTime = Date.now() - startTime;
            
            if (data.error) {
              console.error("[uploadFromPublicUrl] Meta API error:", data.error);
              throw new Error(data.error.message || "Failed to upload video to Meta");
            }
            
            console.log("[uploadFromPublicUrl] ====== SUCCESS ======");
            console.log("[uploadFromPublicUrl] Video ID:", data.id);
            console.log("[uploadFromPublicUrl] Total time:", totalTime, "ms");
            
            // Don't wait for thumbnail here - it will be fetched in Step 4 (PUBLISH)
            console.log("[uploadFromPublicUrl] Skipping thumbnail wait - will fetch in Step 4");
            console.log("=".repeat(80) + "\n");
            
            return {
              success: true,
              videoId: data.id,
              thumbnailUrl: undefined, // Will be fetched in Step 4
              fileName: input.fileName,
              type: "video" as const
            };
          } else {
            // Upload image using url parameter
            console.log("[uploadFromPublicUrl] Uploading image via url...");
            
            const formData = new FormData();
            formData.append('access_token', input.accessToken);
            formData.append('url', input.fileUrl);
            
            const uploadResponse = await fetch(
              `${META_API_BASE}/act_${adAccountId}/adimages`,
              {
                method: 'POST',
                body: formData,
              }
            );
            
            const data = await uploadResponse.json();
            const totalTime = Date.now() - startTime;
            
            if (data.error) {
              console.error("[uploadFromPublicUrl] Meta API error:", data.error);
              throw new Error(data.error.message || "Failed to upload image to Meta");
            }
            
            const images = data.images || {};
            const imageKey = Object.keys(images)[0];
            const imageHash = images[imageKey]?.hash;
            
            console.log("[uploadFromPublicUrl] ====== SUCCESS ======");
            console.log("[uploadFromPublicUrl] Image hash:", imageHash);
            console.log("[uploadFromPublicUrl] Total time:", totalTime, "ms");
            console.log("=".repeat(80) + "\n");
            
            return {
              success: true,
              hash: imageHash,
              fileName: input.fileName,
              type: "image" as const
            };
          }
        } catch (error: any) {
          const totalTime = Date.now() - startTime;
          console.error("[uploadFromPublicUrl] ====== FAILED ======");
          console.error("[uploadFromPublicUrl] Error:", error.message);
          console.error("[uploadFromPublicUrl] Total time:", totalTime, "ms");
          console.error("=".repeat(80) + "\n");
          throw new Error(error.message || "Failed to upload from public URL to Meta");
        }
      }),

    // Upload large video via Bunny CDN then to Meta using file_url
    uploadLargeVideoViaBunny: protectedProcedure
      .input(z.object({
        accessToken: z.string(),
        adAccountId: z.string(),
        fileName: z.string(),
        // Video will be uploaded via multipart form, not base64
      }))
      .mutation(async ({ input }) => {
        // This endpoint is just a placeholder - actual upload happens via separate multipart endpoint
        // The flow is: Frontend uploads to /api/upload-video -> Bunny -> Meta file_url
        console.log("[uploadLargeVideoViaBunny] Called for:", input.fileName);
        return { success: true, message: "Use /api/upload-video endpoint for large files" };
      }),

    // Get ad accounts for the user
    getAdAccounts: protectedProcedure
      .input(z.object({ accessToken: z.string() }))
      .query(async ({ input }) => {
        const data = await metaApiRequest("/me/adaccounts?fields=id,name,account_status", input.accessToken);
        return data.data as Array<{ id: string; name: string; account_status: number }>;
      }),

    // Get Facebook Pages for the user
    getPages: protectedProcedure
      .input(z.object({ accessToken: z.string() }))
      .query(async ({ input }) => {
        try {
          const data = await metaApiRequest("/me/accounts?fields=id,name,access_token,picture{url}", input.accessToken);
          console.log("[getPages] Found", data.data?.length || 0, "pages");
          return data.data as Array<{ id: string; name: string; access_token: string; picture?: { data?: { url?: string } } }>;
        } catch (error: any) {
          console.error("[getPages] Error:", error.message);
          return [];
        }
      }),

    // Get campaigns for an ad account
    getCampaigns: protectedProcedure
      .input(z.object({ accessToken: z.string(), adAccountId: z.string().optional(), showInactive: z.boolean().optional() }))
      .query(async ({ input }) => {
        // First get ad accounts if not provided
        let adAccountId = input.adAccountId;
        if (!adAccountId) {
          const accounts = await metaApiRequest("/me/adaccounts?fields=id,name&limit=1", input.accessToken);
          if (accounts.data && accounts.data.length > 0) {
            adAccountId = accounts.data[0].id;
          } else {
            throw new Error("No ad accounts found");
          }
        }
        
        const data = await metaApiRequest(
          `/${adAccountId}/campaigns?fields=id,name,status,objective&limit=100`,
          input.accessToken
        );
        let campaigns = data.data as Array<{ id: string; name: string; status: string; objective: string }>;
        // Filter inactive if not requested
        if (!input.showInactive) {
          campaigns = campaigns.filter(c => c.status === 'ACTIVE');
        }
        return campaigns;
      }),

    // Get ad sets for a campaign
    getAdSets: protectedProcedure
      .input(z.object({ accessToken: z.string(), campaignId: z.string(), showInactive: z.boolean().optional() }))
      .query(async ({ input }) => {
        const data = await metaApiRequest(
          `/${input.campaignId}/adsets?fields=id,name,status,daily_budget,lifetime_budget,targeting&limit=100`,
          input.accessToken
        );
        let adSets = data.data as Array<{
          id: string;
          name: string;
          status: string;
          daily_budget?: string;
          lifetime_budget?: string;
          targeting?: unknown;
        }>;
        // Filter inactive if not requested
        if (!input.showInactive) {
          adSets = adSets.filter(a => a.status === 'ACTIVE');
        }
        return adSets;
      }),

    // Get ads for an ad set
    getAds: protectedProcedure
      .input(z.object({ accessToken: z.string(), adSetId: z.string(), showInactive: z.boolean().optional() }))
      .query(async ({ input }) => {
        const data = await metaApiRequest(
          `/${input.adSetId}/ads?fields=id,name,status,creative{id,thumbnail_url,image_url}&limit=100`,
          input.accessToken
        );
        let ads = data.data as Array<{
          id: string;
          name: string;
          status: string;
          creative?: { id: string; thumbnail_url?: string; image_url?: string };
        }>;
        // Filter inactive if not requested
        if (!input.showInactive) {
          ads = ads.filter(a => a.status === 'ACTIVE');
        }
        return ads;
      }),

    // Get ad details including creative
    getAdDetails: protectedProcedure
      .input(z.object({ accessToken: z.string(), adId: z.string() }))
      .query(async ({ input }) => {
        // Get ad with creative - including degrees_of_freedom_spec and contextual_multi_ads
        const ad = await metaApiRequest(
          `/${input.adId}?fields=id,name,status,creative{id,name,object_story_spec,asset_feed_spec,degrees_of_freedom_spec,contextual_multi_ads,call_to_action_type}`,
          input.accessToken
        );
        
        console.log("[getAdDetails] Full creative response:", JSON.stringify(ad.creative, null, 2));
        
        let primaryText = "";
        let headline = "";
        let url = "";
        let callToActionType = "LEARN_MORE"; // Default
        
        // Extract text from creative
        if (ad.creative?.object_story_spec?.link_data) {
          const linkData = ad.creative.object_story_spec.link_data;
          primaryText = linkData.message || "";
          headline = linkData.name || linkData.caption || "";
          url = linkData.link || "";
          // Extract CTA type from link_data
          if (linkData.call_to_action?.type) {
            callToActionType = linkData.call_to_action.type;
          }
        } else if (ad.creative?.object_story_spec?.video_data) {
          // Video ad - extract from video_data
          const videoData = ad.creative.object_story_spec.video_data;
          primaryText = videoData.message || "";
          headline = videoData.title || videoData.link_description || "";
          // URL is in call_to_action.value.link
          url = videoData.call_to_action?.value?.link || "";
          // Extract CTA type from video_data
          if (videoData.call_to_action?.type) {
            callToActionType = videoData.call_to_action.type;
          }
          console.log("[getAdDetails] Video ad detected, extracted URL:", url);
        } else if (ad.creative?.asset_feed_spec) {
          const assetFeed = ad.creative.asset_feed_spec;
          if (assetFeed.bodies && assetFeed.bodies.length > 0) {
            primaryText = assetFeed.bodies[0].text || "";
          }
          if (assetFeed.titles && assetFeed.titles.length > 0) {
            headline = assetFeed.titles[0].text || "";
          }
          if (assetFeed.link_urls && assetFeed.link_urls.length > 0) {
            url = assetFeed.link_urls[0].website_url || "";
          }
          // Extract CTA type from asset_feed_spec
          if (assetFeed.call_to_action_types && assetFeed.call_to_action_types.length > 0) {
            callToActionType = assetFeed.call_to_action_types[0];
          }
        }
        
        // Use call_to_action_type from creative level if available
        if (ad.creative?.call_to_action_type) {
          callToActionType = ad.creative.call_to_action_type;
        }
        
        // Extract Advantage+ and Multi-advertiser settings
        const degreesOfFreedomSpec = ad.creative?.degrees_of_freedom_spec || null;
        const contextualMultiAds = ad.creative?.contextual_multi_ads || null;
        
        console.log("[getAdDetails] Extracted settings:");
        console.log("[getAdDetails]   callToActionType:", callToActionType);
        console.log("[getAdDetails]   degreesOfFreedomSpec:", JSON.stringify(degreesOfFreedomSpec));
        console.log("[getAdDetails]   contextualMultiAds:", JSON.stringify(contextualMultiAds));
        
        // Extract page_id from object_story_spec
        const pageId = ad.creative?.object_story_spec?.page_id || "";
        
        return {
          id: ad.id,
          name: ad.name,
          status: ad.status,
          creativeId: ad.creative?.id,
          primaryText,
          headline,
          url,
          pageId,
          // New fields for copying template settings
          callToActionType,
          degreesOfFreedomSpec,
          contextualMultiAds,
        };
      }),

    // Debug: Get ALL ad fields from Meta API
    getAdAllFields: protectedProcedure
      .input(z.object({ accessToken: z.string(), adId: z.string() }))
      .mutation(async ({ input }) => {
        // Get ad with ALL creative fields
        // Request only essential fields that are guaranteed to exist
        const ad = await metaApiRequest(
          `/${input.adId}?fields=id,name,status,effective_status,created_time,updated_time,creative{id,name,title,body,object_story_spec,degrees_of_freedom_spec,contextual_multi_ads,call_to_action_type,image_url,thumbnail_url,video_id,object_type,image_hash}`,
          input.accessToken
        );
        
        console.log("[getAdAllFields] Full response:", JSON.stringify(ad, null, 2));
        
        return {
          raw: ad,
          formatted: JSON.stringify(ad, null, 2),
        };
      }),

    // Duplicate ad set - returns the new ad set ID
    duplicateAdSet: protectedProcedure
      .input(z.object({
        accessToken: z.string(),
        adSetId: z.string(),
        newName: z.string(),
      }))
      .mutation(async ({ input }) => {
        // Get the original ad set details
        const originalAdSet = await metaApiRequest(
          `/${input.adSetId}?fields=campaign_id,name,status,targeting,billing_event,optimization_goal,bid_amount,daily_budget,lifetime_budget,start_time,end_time,promoted_object,account_id`,
          input.accessToken
        );
        
        const adAccountId = `act_${originalAdSet.account_id}`;
        
        // Create new ad set with same settings
        const newAdSetData: Record<string, string> = {
          name: input.newName,
          campaign_id: originalAdSet.campaign_id,
          status: "PAUSED", // Start paused for safety
          billing_event: originalAdSet.billing_event || "IMPRESSIONS",
          optimization_goal: originalAdSet.optimization_goal || "LINK_CLICKS",
        };
        
        if (originalAdSet.targeting) {
          newAdSetData.targeting = JSON.stringify(originalAdSet.targeting);
        }
        if (originalAdSet.bid_amount) {
          newAdSetData.bid_amount = originalAdSet.bid_amount;
        }
        if (originalAdSet.daily_budget) {
          newAdSetData.daily_budget = originalAdSet.daily_budget;
        }
        if (originalAdSet.lifetime_budget) {
          newAdSetData.lifetime_budget = originalAdSet.lifetime_budget;
        }
        if (originalAdSet.promoted_object) {
          newAdSetData.promoted_object = JSON.stringify(originalAdSet.promoted_object);
        }
        
        // Create the new ad set
        const formData = new URLSearchParams();
        Object.entries(newAdSetData).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            formData.append(key, String(value));
          }
        });
        
        const response = await fetch(
          `${META_API_BASE}/${adAccountId}/adsets?access_token=${input.accessToken}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: formData.toString(),
          }
        );
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error?.message || "Failed to duplicate ad set");
        }
        
        const result = await response.json();
        return { 
          id: result.id, 
          name: input.newName,
          adAccountId,
        };
      }),

    // Get page ID from template ad
    getTemplateInfo: protectedProcedure
      .input(z.object({ accessToken: z.string(), adId: z.string() }))
      .query(async ({ input }) => {
        const templateAd = await metaApiRequest(
          `/${input.adId}?fields=adset_id,account_id,creative{object_story_spec}`,
          input.accessToken
        );
        
        let pageId = "";
        if (templateAd.creative?.object_story_spec?.page_id) {
          pageId = templateAd.creative.object_story_spec.page_id;
        }
        
        return {
          adSetId: templateAd.adset_id,
          adAccountId: `act_${templateAd.account_id}`,
          pageId,
        };
      }),

    // Upload image to ad account
    uploadImage: protectedProcedure
      .input(z.object({
        accessToken: z.string(),
        adAccountId: z.string(),
        imageBase64: z.string(),
        filename: z.string(),
      }))
      .mutation(async ({ input }) => {
        const formData = new URLSearchParams();
        formData.append("bytes", input.imageBase64);
        formData.append("name", input.filename);
        
        const response = await fetch(
          `${META_API_BASE}/${input.adAccountId}/adimages?access_token=${input.accessToken}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: formData.toString(),
          }
        );
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error?.message || "Failed to upload image");
        }
        
        const result = await response.json();
        const imageKey = Object.keys(result.images)[0];
        return {
          hash: result.images[imageKey].hash,
          url: result.images[imageKey].url,
        };
      }),

    // Create a single ad in an existing ad set
    createSingleAd: protectedProcedure
      .input(z.object({
        accessToken: z.string(),
        adAccountId: z.string(),
        adSetId: z.string(),
        pageId: z.string(),
        adName: z.string(),
        primaryText: z.string(),
        headline: z.string(),
        url: z.string(),
        images: z.array(z.object({
          filename: z.string(),
          aspectRatio: z.string(),
          base64: z.string(),
        })),
      }))
      .mutation(async ({ input }) => {
        console.log("\n" + "=".repeat(80));
        console.log("[CREATE SINGLE AD] Starting...");
        console.log("=".repeat(80));
        console.log("[INPUT] Ad Account ID:", input.adAccountId);
        console.log("[INPUT] Ad Set ID:", input.adSetId);
        console.log("[INPUT] Page ID:", input.pageId);
        console.log("[INPUT] Ad Name:", input.adName);
        console.log("[INPUT] Primary Text:", input.primaryText.substring(0, 100) + "...");
        console.log("[INPUT] Headline:", input.headline);
        console.log("[INPUT] URL:", input.url);
        console.log("[INPUT] Images count:", input.images.length);
        input.images.forEach((img, i) => {
          console.log(`[INPUT] Image ${i + 1}: ${img.filename} (${img.aspectRatio}) - base64 length: ${img.base64?.length || 0}`);
        });
        
        // Step 1: Upload all images
        console.log("\n[STEP 1] Uploading images to Meta...");
        const uploadedImages: Array<{ hash: string; aspectRatio: string }> = [];
        
        for (const image of input.images) {
          if (!image.base64) {
            console.log(`[STEP 1] Skipping image ${image.filename} - no base64 data`);
            continue;
          }
          
          console.log(`[STEP 1] Uploading image: ${image.filename}...`);
          const imageFormData = new URLSearchParams();
          // Remove data URL prefix if present
          const base64Data = image.base64.includes(',') ? image.base64.split(',')[1] : image.base64;
          imageFormData.append("bytes", base64Data);
          imageFormData.append("name", image.filename);
          
          const imageUrl = `${META_API_BASE}/${input.adAccountId}/adimages?access_token=${input.accessToken.substring(0, 20)}...`;
          console.log(`[STEP 1] POST ${imageUrl}`);
          
          const imageResponse = await fetch(
            `${META_API_BASE}/${input.adAccountId}/adimages?access_token=${input.accessToken}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: imageFormData.toString(),
            }
          );
          
          const imageResponseText = await imageResponse.text();
          console.log(`[STEP 1] Response status: ${imageResponse.status}`);
          console.log(`[STEP 1] Response body: ${imageResponseText.substring(0, 500)}`);
          
          if (!imageResponse.ok) {
            let error;
            try {
              error = JSON.parse(imageResponseText);
            } catch {
              error = { error: { message: imageResponseText } };
            }
            console.error(`[STEP 1] ERROR uploading image:`, error);
            throw new Error(`Failed to upload image ${image.filename}: ${error.error?.message || "Unknown error"}`);
          }
          
          const imageResult = JSON.parse(imageResponseText);
          const imageKey = Object.keys(imageResult.images)[0];
          console.log(`[STEP 1] SUCCESS - Image hash: ${imageResult.images[imageKey].hash}`);
          uploadedImages.push({
            hash: imageResult.images[imageKey].hash,
            aspectRatio: image.aspectRatio,
          });
        }
        
        console.log(`[STEP 1] Total images uploaded: ${uploadedImages.length}`);
        
        if (uploadedImages.length === 0) {
          console.error("[STEP 1] ERROR: No images were uploaded!");
          throw new Error("No images were uploaded");
        }
        
        // Step 2: Create ad creative with placement asset customization
        // Map aspect ratios to Facebook placements
        const getPlacementForAspectRatio = (ratio: string): string[] => {
          switch (ratio) {
            case "9x16":
              return ["instagram_story", "facebook_story", "instagram_reels"];
            case "4x5":
              return ["instagram_stream", "facebook_feed"];
            case "1x1":
              return ["instagram_stream", "facebook_feed", "instagram_explore"];
            case "16x9":
              return ["facebook_feed", "audience_network_instream_video"];
            default:
              return ["facebook_feed"];
          }
        };
        
        // Build creative data
        // If we have multiple aspect ratios, use asset_feed_spec for placement customization
        // Otherwise, use simple object_story_spec
        let creativeData: Record<string, string>;
        
        console.log("\n[STEP 2] Creating ad creative...");
        
        // Build object_story_spec with proper call_to_action structure
        const objectStorySpec = {
          page_id: input.pageId,
          link_data: {
            message: input.primaryText,
            name: input.headline,
            link: input.url,
            image_hash: uploadedImages[0].hash,
            call_to_action: {
              type: "LEARN_MORE",
              value: {
                link: input.url, // Must match the link above
              },
            },
          },
        };
        
        console.log("[STEP 2] object_story_spec:");
        console.log(JSON.stringify(objectStorySpec, null, 2));
        
        if (uploadedImages.length > 1) {
          // Multiple images - use asset feed spec for placement customization
          const assetFeedSpec = {
            images: uploadedImages.map(img => ({ hash: img.hash })),
            bodies: [{ text: input.primaryText }],
            titles: [{ text: input.headline }],
            descriptions: [{ text: input.headline }],
            link_urls: [{ website_url: input.url }],
            call_to_action_types: ["LEARN_MORE"],
            ad_formats: ["SINGLE_IMAGE"],
          };
          
          console.log("[STEP 2] Using asset_feed_spec for multiple images:");
          console.log(JSON.stringify(assetFeedSpec, null, 2));
          
          creativeData = {
            name: `${input.adName}_creative`,
            object_story_spec: JSON.stringify(objectStorySpec),
            asset_feed_spec: JSON.stringify(assetFeedSpec),
            // Disable all Advantage+ creative enhancements
            degrees_of_freedom_spec: JSON.stringify({
              creative_features_spec: {
                image_touchups: { enroll_status: "OPT_OUT" },
                enhance_cta: { enroll_status: "OPT_OUT" },
                cv_transformation: { enroll_status: "OPT_OUT" },
                image_brightness_and_contrast: { enroll_status: "OPT_OUT" },
                video_auto_crop: { enroll_status: "OPT_OUT" },
                video_filtering: { enroll_status: "OPT_OUT" },
                text_optimizations: { enroll_status: "OPT_OUT" },
                inline_comment: { enroll_status: "OPT_OUT" },
                image_templates: { enroll_status: "OPT_OUT" },
                advantage_plus_creative: { enroll_status: "OPT_OUT" },
              },
            }),
            // Disable Multi-advertiser ads
            contextual_multi_ads: JSON.stringify({
              enroll_status: "OPT_OUT",
            }),
          };
        } else {
          // Single image - simple creative
          console.log("[STEP 2] Using single image creative (no asset_feed_spec)");
          creativeData = {
            name: `${input.adName}_creative`,
            object_story_spec: JSON.stringify(objectStorySpec),
            // Disable all Advantage+ creative enhancements
            degrees_of_freedom_spec: JSON.stringify({
              creative_features_spec: {
                image_touchups: { enroll_status: "OPT_OUT" },
                enhance_cta: { enroll_status: "OPT_OUT" },
                cv_transformation: { enroll_status: "OPT_OUT" },
                image_brightness_and_contrast: { enroll_status: "OPT_OUT" },
                video_auto_crop: { enroll_status: "OPT_OUT" },
                video_filtering: { enroll_status: "OPT_OUT" },
                text_optimizations: { enroll_status: "OPT_OUT" },
                inline_comment: { enroll_status: "OPT_OUT" },
                image_templates: { enroll_status: "OPT_OUT" },
                advantage_plus_creative: { enroll_status: "OPT_OUT" },
              },
            }),
            // Disable Multi-advertiser ads
            contextual_multi_ads: JSON.stringify({
              enroll_status: "OPT_OUT",
            }),
          };
        }
        
        console.log("[STEP 2] Final creative data:");
        console.log(JSON.stringify(creativeData, null, 2));
        
        const creativeFormData = new URLSearchParams();
        Object.entries(creativeData).forEach(([key, value]) => {
          creativeFormData.append(key, value);
        });
        
        const creativeUrl = `${META_API_BASE}/${input.adAccountId}/adcreatives`;
        console.log(`[STEP 2] POST ${creativeUrl}`);
        
        const creativeResponse = await fetch(
          `${creativeUrl}?access_token=${input.accessToken}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: creativeFormData.toString(),
          }
        );
        
        const creativeResponseText = await creativeResponse.text();
        console.log(`[STEP 2] Response status: ${creativeResponse.status}`);
        console.log(`[STEP 2] Response body: ${creativeResponseText}`);
        
        if (!creativeResponse.ok) {
          let error;
          try {
            error = JSON.parse(creativeResponseText);
          } catch {
            error = { error: { message: creativeResponseText } };
          }
          console.error("[STEP 2] ERROR creating creative:");
          console.error(JSON.stringify(error, null, 2));
          throw new Error(`Failed to create creative: ${error.error?.message || "Unknown error"}`);
        }
        
        const newCreative = JSON.parse(creativeResponseText);
        console.log(`[STEP 2] SUCCESS - Creative ID: ${newCreative.id}`);
        
        // Step 3: Create the ad
        console.log("\n[STEP 3] Creating ad...");
        const adData = {
          name: input.adName,
          adset_id: input.adSetId,
          creative: JSON.stringify({ creative_id: newCreative.id }),
          status: "PAUSED",
        };
        
        console.log("[STEP 3] Ad data:");
        console.log(JSON.stringify(adData, null, 2));
        
        const adFormData = new URLSearchParams();
        Object.entries(adData).forEach(([key, value]) => {
          adFormData.append(key, value);
        });
        
        const adUrl = `${META_API_BASE}/${input.adAccountId}/ads`;
        console.log(`[STEP 3] POST ${adUrl}`);
        
        const adResponse = await fetch(
          `${adUrl}?access_token=${input.accessToken}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: adFormData.toString(),
          }
        );
        
        const adResponseText = await adResponse.text();
        console.log(`[STEP 3] Response status: ${adResponse.status}`);
        console.log(`[STEP 3] Response body: ${adResponseText}`);
        
        if (!adResponse.ok) {
          let error;
          try {
            error = JSON.parse(adResponseText);
          } catch {
            error = { error: { message: adResponseText } };
          }
          console.error("[STEP 3] ERROR creating ad:");
          console.error(JSON.stringify(error, null, 2));
          throw new Error(`Failed to create ad: ${error.error?.message || "Unknown error"}`);
        }
        
        const newAd = JSON.parse(adResponseText);
        console.log(`[STEP 3] SUCCESS - Ad ID: ${newAd.id}`);
        console.log("=".repeat(80));
        console.log("[CREATE SINGLE AD] COMPLETED SUCCESSFULLY!");
        console.log("=".repeat(80) + "\n");
        
        return {
          success: true,
          creativeId: newCreative.id,
          adId: newAd.id,
        };
      }),

    // Batch create all ads (duplicate ad set once, then create multiple ads)
    batchCreateAds: protectedProcedure
      .input(z.object({
        accessToken: z.string(),
        templateAdId: z.string(),
        newAdSetName: z.string(),
        scheduledTime: z.string().optional(), // ISO timestamp for scheduled publish
        pageId: z.string().optional(), // Optional: override page ID from template
        postComment: z.string().optional(), // Optional: comment to post on each created ad
        ads: z.array(z.object({
          adName: z.string(),
          primaryText: z.string(),
          headline: z.string(),
          url: z.string(),
          media: z.array(z.object({
            filename: z.string(),
            aspectRatio: z.string(),
            base64: z.string().optional(), // Optional - not needed if metaHash/metaVideoId provided
            type: z.enum(["image", "video"]),
            metaHash: z.string().optional(), // Pre-uploaded image hash
            metaVideoId: z.string().optional(), // Pre-uploaded video ID
            metaThumbnailUrl: z.string().optional(), // Pre-fetched video thumbnail URL from Meta
          })),
        })),
      }))
      .mutation(async ({ input }) => {
        // Collect logs for frontend debugging
        const serverLogs: string[] = [];
        const log = (message: string) => { console.log(message); serverLogs.push(message); };
        const logError = (message: string) => { console.error(message); serverLogs.push(`[ERROR] ${message}`); };
        
        log("\n" + "*".repeat(120));
        log("[STEP 0] ******** BATCH CREATE ADS - STARTING ********");
        log("[STEP 0] Template Ad ID: " + input.templateAdId);
        log("[STEP 0] New Ad Set Name: " + input.newAdSetName);
        log("[STEP 0] Scheduled Time: " + (input.scheduledTime || "Not scheduled"));
        log("[STEP 0] Number of ads to create: " + input.ads.length);
        log("[STEP 0] Access Token (first 20 chars): " + input.accessToken?.substring(0, 20) + "...");
        log("*".repeat(120));
        
        // STEP 1: Get template info
        console.log("\n[STEP 1] ======== GETTING TEMPLATE AD INFO ========");
        console.log("[STEP 1] Fetching:", `/${input.templateAdId}?fields=adset_id,account_id,creative{object_story_spec}`);
        
        const templateAd = await metaApiRequest(
          `/${input.templateAdId}?fields=adset_id,account_id,creative{object_story_spec}`,
          input.accessToken
        );
        
        console.log("[STEP 1] Template Ad Response:", JSON.stringify(templateAd, null, 2));
        
        const adAccountId = `act_${templateAd.account_id}`;
        const originalAdSetId = templateAd.adset_id;
        
        console.log("[STEP 1] Ad Account ID:", adAccountId);
        console.log("[STEP 1] Original Ad Set ID:", originalAdSetId);
        
        // Extract page ID from creative OR use override from input
        let pageId = input.pageId || "";
        if (!pageId && templateAd.creative?.object_story_spec?.page_id) {
          pageId = templateAd.creative.object_story_spec.page_id;
        }
        
        console.log("[STEP 1] Page ID:", pageId, input.pageId ? "(from input override)" : "(from template)");
        
        if (!pageId) {
          console.error("[STEP 1] ERROR: Could not determine page ID from template ad or input");
          throw new Error("Could not determine page ID from template ad. Please select a Facebook Page.");
        }
        
        console.log("[STEP 1] ======== TEMPLATE AD INFO COMPLETE ========\n");
        
        // STEP 2: Get original ad set data
        console.log("[STEP 2] ======== GETTING ORIGINAL AD SET DATA ========");
        console.log("[STEP 2] Fetching:", `/${originalAdSetId}?fields=...`);
        
        const originalAdSet = await metaApiRequest(
          `/${originalAdSetId}?fields=campaign_id,targeting,billing_event,optimization_goal,bid_amount,bid_strategy,daily_budget,lifetime_budget,promoted_object,destination_type,attribution_spec,start_time,end_time`,
          input.accessToken
        );
        
        console.log("[STEP 2] Original Ad Set Response:", JSON.stringify(originalAdSet, null, 2));
        console.log("[STEP 2] ======== ORIGINAL AD SET DATA COMPLETE ========\n");
        
        // When scheduled, set status to ACTIVE so Meta will publish at the scheduled time
        // When not scheduled, keep PAUSED for manual activation
        const adSetStatus = input.scheduledTime ? "ACTIVE" : "PAUSED";
        console.log("[STEP 2.5] Ad Set Status:", adSetStatus, input.scheduledTime ? "(scheduled - will auto-publish)" : "(manual activation required)");
        
        const newAdSetData: Record<string, string> = {
          name: input.newAdSetName,
          campaign_id: originalAdSet.campaign_id,
          status: adSetStatus,
          billing_event: originalAdSet.billing_event || "IMPRESSIONS",
          optimization_goal: originalAdSet.optimization_goal || "LINK_CLICKS",
        };
        
        if (originalAdSet.targeting) {
          newAdSetData.targeting = JSON.stringify(originalAdSet.targeting);
        }
        if (originalAdSet.daily_budget) {
          newAdSetData.daily_budget = originalAdSet.daily_budget;
        }
        if (originalAdSet.lifetime_budget) {
          newAdSetData.lifetime_budget = originalAdSet.lifetime_budget;
        }
        if (originalAdSet.bid_amount) {
          newAdSetData.bid_amount = originalAdSet.bid_amount;
        }
        if (originalAdSet.bid_strategy) {
          newAdSetData.bid_strategy = originalAdSet.bid_strategy;
        }
        if (originalAdSet.promoted_object) {
          newAdSetData.promoted_object = JSON.stringify(originalAdSet.promoted_object);
        }
        if (originalAdSet.destination_type) {
          newAdSetData.destination_type = originalAdSet.destination_type;
        }
        if (originalAdSet.attribution_spec) {
          newAdSetData.attribution_spec = JSON.stringify(originalAdSet.attribution_spec);
        }
        
        // Add start_time for scheduled publishing
        if (input.scheduledTime) {
          // Convert ISO string to Unix timestamp
          const scheduledDate = new Date(input.scheduledTime);
          const unixTimestamp = Math.floor(scheduledDate.getTime() / 1000);
          newAdSetData.start_time = unixTimestamp.toString();
          console.log("[STEP 2.6] Scheduled start_time:", input.scheduledTime, "-> Unix:", unixTimestamp);
        }
        
        // STEP 3: Create new ad set
        console.log("[STEP 3] ======== CREATING NEW AD SET ========");
        console.log("[STEP 3] New Ad Set Data:", JSON.stringify(newAdSetData, null, 2));
        console.log("[STEP 3] Endpoint:", `${META_API_BASE}/${adAccountId}/adsets`);
        
        const adSetFormData = new URLSearchParams();
        Object.entries(newAdSetData).forEach(([key, value]) => {
          adSetFormData.append(key, value);
        });
        
        console.log("[STEP 3] Sending POST request...");
        const adSetResponse = await fetch(
          `${META_API_BASE}/${adAccountId}/adsets?access_token=${input.accessToken}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: adSetFormData.toString(),
          }
        );
        
        console.log("[STEP 3] Response status:", adSetResponse.status);
        
        if (!adSetResponse.ok) {
          const errorText = await adSetResponse.text();
          console.error("[STEP 3] ERROR - Ad Set creation failed!");
          console.error("[STEP 3] Response status:", adSetResponse.status);
          console.error("[STEP 3] Raw response:", errorText);
          let error;
          try {
            error = JSON.parse(errorText);
            console.error("[STEP 3] Error message:", error.error?.message);
            console.error("[STEP 3] Error code:", error.error?.code);
            console.error("[STEP 3] Error subcode:", error.error?.error_subcode);
            console.error("[STEP 3] Error user msg:", error.error?.error_user_msg);
          } catch {
            error = { error: { message: errorText } };
          }
          throw new Error(`Failed to create ad set: ${error.error?.error_user_msg || error.error?.message || JSON.stringify(error)}`);
        }
        
        const newAdSet = await adSetResponse.json();
        console.log("[STEP 3] SUCCESS - New Ad Set created!");
        console.log("[STEP 3] New Ad Set ID:", newAdSet.id);
        console.log("[STEP 3] Full response:", JSON.stringify(newAdSet, null, 2));
        console.log("[STEP 3] ======== AD SET CREATION COMPLETE ========\n");
        
        // STEP 4: Create each ad in the new ad set
        console.log("[STEP 4] ======== CREATING ADS IN NEW AD SET ========");
        console.log("[STEP 4] Total ads to create:", input.ads.length);
        
        const results: Array<{ adName: string; success: boolean; adId?: string; error?: string; postUrl?: string; commentPosted?: boolean }> = [];
        let adIndex = 0;
        
        for (const ad of input.ads) {
          adIndex++;
          
          // Retry logic - max 2 attempts per ad
          const MAX_RETRIES = 2;
          let lastError = '';
          let adSuccess = false;
          
          for (let attempt = 1; attempt <= MAX_RETRIES && !adSuccess; attempt++) {
          try {
            if (attempt > 1) {
              console.log(`\n[STEP 4.${adIndex}] RETRY ATTEMPT ${attempt}/${MAX_RETRIES}`);
              // Wait 3 seconds before retry
              await new Promise(resolve => setTimeout(resolve, 3000));
            }
            console.log("\n" + "#".repeat(120));
            console.log(`[STEP 4.${adIndex}] ######## PROCESSING AD ${adIndex}/${input.ads.length}: ${ad.adName} ########`);
            console.log(`[STEP 4.${adIndex}] Ad Name: ${ad.adName}`);
            console.log(`[STEP 4.${adIndex}] Primary Text: ${ad.primaryText?.substring(0, 100)}...`);
            console.log(`[STEP 4.${adIndex}] Headline: ${ad.headline}`);
            console.log(`[STEP 4.${adIndex}] URL: ${ad.url}`);
            console.log(`[STEP 4.${adIndex}] Media count: ${ad.media.length}`);
            
            // Log each media item in detail
            ad.media.forEach((m, i) => {
              console.log(`[STEP 4.${adIndex}] Media[${i}]:`);
              console.log(`[STEP 4.${adIndex}]   - filename: ${m.filename}`);
              console.log(`[STEP 4.${adIndex}]   - type: ${m.type}`);
              console.log(`[STEP 4.${adIndex}]   - aspectRatio: ${m.aspectRatio}`);
              console.log(`[STEP 4.${adIndex}]   - base64 length: ${m.base64?.length || 0}`);
              console.log(`[STEP 4.${adIndex}]   - base64 exists: ${!!m.base64}`);
              if (m.base64) {
                console.log(`[STEP 4.${adIndex}]   - base64 first 100 chars: ${m.base64.substring(0, 100)}...`);
              } else {
                console.log(`[STEP 4.${adIndex}]   - WARNING: base64 is empty or undefined!`);
              }
            });
            
            // Separate images and videos
            const images = ad.media.filter(m => m.type === "image");
            const videos = ad.media.filter(m => m.type === "video");
            
            console.log(`[STEP 4.${adIndex}] Filtered - Images: ${images.length}, Videos: ${videos.length}`);
            console.log("#".repeat(120));
            
            // STEP 4a: Upload images
            console.log(`\n[STEP 4.${adIndex}a] -------- UPLOADING IMAGES --------`);
            const uploadedImages: Array<{ hash: string; aspectRatio: string }> = [];
            let imageIndex = 0;
            
            for (const image of images) {
              imageIndex++;
              console.log(`[STEP 4.${adIndex}a] Image ${imageIndex}/${images.length}: ${image.filename}`);
              
              // If we already have a metaHash from pre-upload, use it directly
              if (image.metaHash) {
                console.log(`[STEP 4.${adIndex}a] Using pre-uploaded hash: ${image.metaHash}`);
                uploadedImages.push({
                  hash: image.metaHash,
                  aspectRatio: image.aspectRatio,
                });
                continue;
              }
              
              if (!image.base64) {
                console.log(`[STEP 4.${adIndex}a] SKIPPING - no base64 data and no metaHash for ${image.filename}`);
                continue;
              }
              
              console.log(`[STEP 4.${adIndex}a] Uploading image: ${image.filename}`);
              console.log(`[STEP 4.${adIndex}a] Base64 length: ${image.base64.length}`);
              console.log(`[STEP 4.${adIndex}a] Endpoint: ${META_API_BASE}/${adAccountId}/adimages`);
              
              const imageFormData = new URLSearchParams();
              imageFormData.append("bytes", image.base64);
              imageFormData.append("name", image.filename);
              
              console.log(`[STEP 4.${adIndex}a] Sending POST request...`);
              
              const imageResponse = await fetch(
                `${META_API_BASE}/${adAccountId}/adimages?access_token=${input.accessToken}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/x-www-form-urlencoded" },
                  body: imageFormData.toString(),
                }
              );
              
              if (!imageResponse.ok) {
                const errorText = await imageResponse.text();
                console.error("\n" + "=".repeat(100));
                console.error("[IMAGE UPLOAD ERROR] ============= FULL ERROR DETAILS =============");
                console.error("[IMAGE UPLOAD ERROR] Response status:", imageResponse.status);
                console.error("[IMAGE UPLOAD ERROR] Raw response:", errorText);
                let error;
                try {
                  error = JSON.parse(errorText);
                  console.error("[IMAGE UPLOAD ERROR] Parsed error:");
                  console.error("[IMAGE UPLOAD ERROR]   message:", error.error?.message);
                  console.error("[IMAGE UPLOAD ERROR]   code:", error.error?.code);
                  console.error("[IMAGE UPLOAD ERROR]   error_subcode:", error.error?.error_subcode);
                  console.error("[IMAGE UPLOAD ERROR]   error_user_msg:", error.error?.error_user_msg);
                  console.error("[IMAGE UPLOAD ERROR]   fbtrace_id:", error.error?.fbtrace_id);
                } catch {
                  error = { error: { message: errorText } };
                }
                console.error("[IMAGE UPLOAD ERROR] Image filename:", image.filename);
                console.error("[IMAGE UPLOAD ERROR] Base64 length:", image.base64?.length);
                console.error("=".repeat(100) + "\n");
                throw new Error(`Failed to upload image: ${error.error?.error_user_msg || error.error?.message || "Unknown error"}`);
              }
              
              const imageResult = await imageResponse.json();
              const imageKey = Object.keys(imageResult.images)[0];
              console.log("\n" + "=".repeat(80));
              console.log("[IMAGE UPLOAD SUCCESS]");
              console.log("[IMAGE UPLOAD SUCCESS] Filename:", image.filename);
              console.log("[IMAGE UPLOAD SUCCESS] Image hash:", imageResult.images[imageKey].hash);
              console.log("[IMAGE UPLOAD SUCCESS] Full response:", JSON.stringify(imageResult, null, 2));
              console.log("=".repeat(80) + "\n");
              uploadedImages.push({
                hash: imageResult.images[imageKey].hash,
                aspectRatio: image.aspectRatio,
              });
            }
            
            // STEP 4b: Upload videos
            console.log(`\n[STEP 4.${adIndex}b] -------- UPLOADING VIDEOS --------`);
            const uploadedVideos: Array<{ id: string; aspectRatio: string; thumbnailUrl?: string }> = [];
            let videoIndex = 0;
            
            for (const video of videos) {
              videoIndex++;
              console.log(`[STEP 4.${adIndex}b] Video ${videoIndex}/${videos.length}: ${video.filename}`);
              
              // If we already have a metaVideoId from pre-upload, use it directly
              if (video.metaVideoId) {
                console.log(`[STEP 4.${adIndex}b] Using pre-uploaded video ID: ${video.metaVideoId}`);
                console.log(`[STEP 4.${adIndex}b] Pre-uploaded thumbnail URL: ${video.metaThumbnailUrl || 'none'}`);
                uploadedVideos.push({
                  id: video.metaVideoId,
                  aspectRatio: video.aspectRatio,
                  thumbnailUrl: video.metaThumbnailUrl,
                });
                continue;
              }
              
              if (!video.base64) {
                console.log(`[STEP 4.${adIndex}b] SKIPPING - no base64 data and no metaVideoId for ${video.filename}`);
                continue;
              }
              
              console.log(`[STEP 4.${adIndex}b] Uploading video: ${video.filename}`);
              console.log(`[STEP 4.${adIndex}b] Base64 length: ${video.base64.length}`);
              console.log(`[STEP 4.${adIndex}b] Endpoint: ${META_API_BASE}/${adAccountId}/advideos`);
              
              const videoFormData = new URLSearchParams();
              videoFormData.append("source", `data:video/mp4;base64,${video.base64}`);
              videoFormData.append("title", video.filename);
              
              console.log(`[STEP 4.${adIndex}b] Sending POST request...`);
              const videoResponse = await fetch(
                `${META_API_BASE}/${adAccountId}/advideos?access_token=${input.accessToken}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/x-www-form-urlencoded" },
                  body: videoFormData.toString(),
                }
              );
              
              console.log(`[STEP 4.${adIndex}b] Response status: ${videoResponse.status}`);
              
              if (!videoResponse.ok) {
                const errorText = await videoResponse.text();
                console.error(`[STEP 4.${adIndex}b] ERROR - Video upload failed!`);
                console.error(`[STEP 4.${adIndex}b] Raw response: ${errorText}`);
                let error;
                try {
                  error = JSON.parse(errorText);
                  console.error(`[STEP 4.${adIndex}b] Error message: ${error.error?.message}`);
                  console.error(`[STEP 4.${adIndex}b] Error code: ${error.error?.code}`);
                  console.error(`[STEP 4.${adIndex}b] Error user msg: ${error.error?.error_user_msg}`);
                } catch {
                  error = { error: { message: errorText } };
                }
                throw new Error(`Failed to upload video: ${error.error?.error_user_msg || error.error?.message || "Unknown error"}`);
              }
              
              const videoResult = await videoResponse.json();
              console.log(`[STEP 4.${adIndex}b] SUCCESS - Video uploaded!`);
              console.log(`[STEP 4.${adIndex}b] Video ID: ${videoResult.id}`);
              console.log(`[STEP 4.${adIndex}b] Full response: ${JSON.stringify(videoResult, null, 2)}`);
              
              uploadedVideos.push({
                id: videoResult.id,
                aspectRatio: video.aspectRatio,
              });
            }
            
            // STEP 4c: Verify media was uploaded
            console.log(`\n[STEP 4.${adIndex}c] -------- VERIFYING UPLOADED MEDIA --------`);
            console.log(`[STEP 4.${adIndex}c] Uploaded images: ${uploadedImages.length}`);
            uploadedImages.forEach((img, i) => {
              console.log(`[STEP 4.${adIndex}c]   Image ${i+1}: hash=${img.hash}, aspectRatio=${img.aspectRatio}`);
            });
            console.log(`[STEP 4.${adIndex}c] Uploaded videos: ${uploadedVideos.length}`);
            uploadedVideos.forEach((vid, i) => {
              console.log(`[STEP 4.${adIndex}c]   Video ${i+1}: id=${vid.id}, aspectRatio=${vid.aspectRatio}`);
            });
            
            if (uploadedImages.length === 0 && uploadedVideos.length === 0) {
              console.error(`[STEP 4.${adIndex}c] ERROR: No media was uploaded for ad ${ad.adName}`);
              console.error(`[STEP 4.${adIndex}c] Images attempted: ${images.length}, Videos attempted: ${videos.length}`);
              throw new Error("No media was uploaded - check if base64 data was provided");
            }
            
            console.log(`[STEP 4.${adIndex}c] Media verification PASSED`);
            
            // STEP 4d: Create creative
            console.log(`\n[STEP 4.${adIndex}d] -------- CREATING CREATIVE --------`);
            let creativeData: Record<string, string>;
            
            if (uploadedVideos.length > 0) {
              console.log(`[STEP 4.${adIndex}d] Creating VIDEO creative`);
              
              // Determine thumbnail source: prefer image_hash if we have uploaded images, otherwise fetch from Meta
              const thumbnailData: Record<string, string> = {};
              if (uploadedImages.length > 0) {
                thumbnailData.image_hash = uploadedImages[0].hash;
                console.log(`[STEP 4.${adIndex}d] Using uploaded image as thumbnail, hash: ${uploadedImages[0].hash}`);
              } else {
                // Fetch thumbnail from Meta now (video should be processed by now)
                console.log(`[STEP 4.${adIndex}d] Fetching thumbnail from Meta for video ${uploadedVideos[0].id}...`);
                const thumbnailUrl = await getVideoThumbnailUrl(uploadedVideos[0].id, input.accessToken);
                if (thumbnailUrl) {
                  thumbnailData.image_url = thumbnailUrl;
                  console.log(`[STEP 4.${adIndex}d] Got Meta video thumbnail URL: ${thumbnailUrl}`);
                } else {
                  console.warn(`[STEP 4.${adIndex}d] WARNING: No thumbnail available for video ad - Meta will auto-generate`);
                }
              }
              
              // Video creative
              creativeData = {
                name: `${ad.adName}_creative`,
                object_story_spec: JSON.stringify({
                  page_id: pageId,
                  video_data: {
                    video_id: uploadedVideos[0].id,
                    message: ad.primaryText,
                    title: ad.headline,
                    link_description: ad.headline,
                    call_to_action: { 
                      type: "LEARN_MORE",
                      value: { link: ad.url }
                    },
                    ...thumbnailData,
                  },
                }),
                // Disable all Advantage+ creative enhancements
                degrees_of_freedom_spec: JSON.stringify({
                  creative_features_spec: {
                    image_touchups: { enroll_status: "OPT_OUT" },
                    enhance_cta: { enroll_status: "OPT_OUT" },
                    cv_transformation: { enroll_status: "OPT_OUT" },
                    image_brightness_and_contrast: { enroll_status: "OPT_OUT" },
                    video_auto_crop: { enroll_status: "OPT_OUT" },
                    video_filtering: { enroll_status: "OPT_OUT" },
                    text_optimizations: { enroll_status: "OPT_OUT" },
                    inline_comment: { enroll_status: "OPT_OUT" },
                    image_templates: { enroll_status: "OPT_OUT" },
                    advantage_plus_creative: { enroll_status: "OPT_OUT" },
                  },
                }),
                // Disable Multi-advertiser ads
                contextual_multi_ads: JSON.stringify({
                  enroll_status: "OPT_OUT",
                }),
              };
            } else {
              console.log(`[STEP 4.${adIndex}d] Creating IMAGE creative`);
              // Image creative
              creativeData = {
                name: `${ad.adName}_creative`,
                object_story_spec: JSON.stringify({
                  page_id: pageId,
                  link_data: {
                    message: ad.primaryText,
                    name: ad.headline,
                    link: ad.url,
                    image_hash: uploadedImages[0].hash,
                    call_to_action: { 
                      type: "LEARN_MORE",
                      value: { link: ad.url }
                    },
                  },
                }),
                // Disable all Advantage+ creative enhancements
                degrees_of_freedom_spec: JSON.stringify({
                  creative_features_spec: {
                    image_touchups: { enroll_status: "OPT_OUT" },
                    enhance_cta: { enroll_status: "OPT_OUT" },
                    cv_transformation: { enroll_status: "OPT_OUT" },
                    image_brightness_and_contrast: { enroll_status: "OPT_OUT" },
                    video_auto_crop: { enroll_status: "OPT_OUT" },
                    video_filtering: { enroll_status: "OPT_OUT" },
                    text_optimizations: { enroll_status: "OPT_OUT" },
                    inline_comment: { enroll_status: "OPT_OUT" },
                    image_templates: { enroll_status: "OPT_OUT" },
                    advantage_plus_creative: { enroll_status: "OPT_OUT" },
                  },
                }),
                // Disable Multi-advertiser ads
                contextual_multi_ads: JSON.stringify({
                  enroll_status: "OPT_OUT",
                }),
              };
            }
            
            const creativeFormData = new URLSearchParams();
            Object.entries(creativeData).forEach(([key, value]) => {
              creativeFormData.append(key, value);
            });
            
            console.log(`[STEP 4.${adIndex}d] Creative data prepared:`);
            console.log(`[STEP 4.${adIndex}d]   name: ${creativeData.name}`);
            const parsedSpec = JSON.parse(creativeData.object_story_spec);
            console.log(`[STEP 4.${adIndex}d]   page_id: ${parsedSpec.page_id}`);
            if (parsedSpec.link_data) {
              console.log(`[STEP 4.${adIndex}d]   link_data.message: ${parsedSpec.link_data.message?.substring(0, 50)}...`);
              console.log(`[STEP 4.${adIndex}d]   link_data.name: ${parsedSpec.link_data.name}`);
              console.log(`[STEP 4.${adIndex}d]   link_data.link: ${parsedSpec.link_data.link}`);
              console.log(`[STEP 4.${adIndex}d]   link_data.image_hash: ${parsedSpec.link_data.image_hash}`);
              console.log(`[STEP 4.${adIndex}d]   link_data.call_to_action: ${JSON.stringify(parsedSpec.link_data.call_to_action)}`);
            }
            if (parsedSpec.video_data) {
              console.log(`[STEP 4.${adIndex}d]   video_data.video_id: ${parsedSpec.video_data.video_id}`);
              console.log(`[STEP 4.${adIndex}d]   video_data.message: ${parsedSpec.video_data.message?.substring(0, 50)}...`);
              console.log(`[STEP 4.${adIndex}d]   video_data.title: ${parsedSpec.video_data.title}`);
            }
            console.log(`[STEP 4.${adIndex}d] Full object_story_spec: ${JSON.stringify(parsedSpec, null, 2)}`);
            console.log(`[STEP 4.${adIndex}d] Endpoint: ${META_API_BASE}/${adAccountId}/adcreatives`);
            console.log(`[STEP 4.${adIndex}d] Sending POST request...`);
            
            const creativeResponse = await fetch(
              `${META_API_BASE}/${adAccountId}/adcreatives?access_token=${input.accessToken}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: creativeFormData.toString(),
              }
            );
            
            if (!creativeResponse.ok) {
              const errorText = await creativeResponse.text();
              console.error("\n" + "=".repeat(100));
              console.error("[CREATIVE ERROR] ============= FULL ERROR DETAILS =============");
              console.error("[CREATIVE ERROR] Response status:", creativeResponse.status);
              console.error("[CREATIVE ERROR] Response headers:", JSON.stringify(Object.fromEntries(creativeResponse.headers.entries()), null, 2));
              console.error("[CREATIVE ERROR] Raw response text:", errorText);
              
              let error;
              try {
                error = JSON.parse(errorText);
                console.error("[CREATIVE ERROR] Parsed error object:");
                console.error("[CREATIVE ERROR]   message:", error.error?.message);
                console.error("[CREATIVE ERROR]   type:", error.error?.type);
                console.error("[CREATIVE ERROR]   code:", error.error?.code);
                console.error("[CREATIVE ERROR]   error_subcode:", error.error?.error_subcode);
                console.error("[CREATIVE ERROR]   error_user_title:", error.error?.error_user_title);
                console.error("[CREATIVE ERROR]   error_user_msg:", error.error?.error_user_msg);
                console.error("[CREATIVE ERROR]   fbtrace_id:", error.error?.fbtrace_id);
                console.error("[CREATIVE ERROR]   is_transient:", error.error?.is_transient);
              } catch {
                error = { error: { message: errorText } };
              }
              
              console.error("[CREATIVE ERROR] ============= REQUEST DATA SENT =============");
              console.error("[CREATIVE ERROR] Endpoint:", `${META_API_BASE}/${adAccountId}/adcreatives`);
              console.error("[CREATIVE ERROR] Creative name:", creativeData.name);
              console.error("[CREATIVE ERROR] object_story_spec (raw):", creativeData.object_story_spec);
              try {
                const parsedSpec = JSON.parse(creativeData.object_story_spec);
                console.error("[CREATIVE ERROR] object_story_spec (parsed):", JSON.stringify(parsedSpec, null, 2));
                console.error("[CREATIVE ERROR]   page_id:", parsedSpec.page_id);
                if (parsedSpec.link_data) {
                  console.error("[CREATIVE ERROR]   link_data.message:", parsedSpec.link_data.message?.substring(0, 100) + "...");
                  console.error("[CREATIVE ERROR]   link_data.name:", parsedSpec.link_data.name);
                  console.error("[CREATIVE ERROR]   link_data.link:", parsedSpec.link_data.link);
                  console.error("[CREATIVE ERROR]   link_data.image_hash:", parsedSpec.link_data.image_hash);
                  console.error("[CREATIVE ERROR]   link_data.call_to_action:", JSON.stringify(parsedSpec.link_data.call_to_action));
                }
              } catch (e) {
                console.error("[CREATIVE ERROR] Could not parse object_story_spec");
              }
              console.error("=".repeat(100) + "\n");
              
              // Build detailed error message
              const errorDetails = error.error?.error_user_msg || error.error?.message || JSON.stringify(error);
              throw new Error(`Failed to create creative: ${errorDetails}`);
            }
            
            const newCreative = await creativeResponse.json();
            console.log(`[STEP 4.${adIndex}d] SUCCESS - Creative created!`);
            console.log(`[STEP 4.${adIndex}d] Creative ID: ${newCreative.id}`);
            console.log(`[STEP 4.${adIndex}d] Full response: ${JSON.stringify(newCreative, null, 2)}`);
            
            // STEP 4e: Create ad
            console.log(`\n[STEP 4.${adIndex}e] -------- CREATING AD --------`);
            // When scheduled, set status to ACTIVE so Meta will publish at the scheduled time
            const adStatus = input.scheduledTime ? "ACTIVE" : "PAUSED";
            const adData: Record<string, string> = {
              name: ad.adName,
              adset_id: newAdSet.id,
              creative: JSON.stringify({ creative_id: newCreative.id }),
              status: adStatus,
            };
            
            // Log scheduled time if provided
            if (input.scheduledTime) {
              console.log(`[STEP 4.${adIndex}e] Scheduled time: ${input.scheduledTime}`);
              console.log(`[STEP 4.${adIndex}e] Ad status set to ACTIVE for scheduled publishing`);
            }
            
            console.log(`[STEP 4.${adIndex}e] Ad data:`);
            console.log(`[STEP 4.${adIndex}e]   name: ${adData.name}`);
            console.log(`[STEP 4.${adIndex}e]   adset_id: ${adData.adset_id}`);
            console.log(`[STEP 4.${adIndex}e]   creative: ${adData.creative}`);
            console.log(`[STEP 4.${adIndex}e]   status: ${adData.status}`);
            console.log(`[STEP 4.${adIndex}e] Endpoint: ${META_API_BASE}/${adAccountId}/ads`);
            
            const adFormData = new URLSearchParams();
            Object.entries(adData).forEach(([key, value]) => {
              adFormData.append(key, value);
            });
            
            console.log(`[STEP 4.${adIndex}e] Sending POST request...`);
            const adResponse = await fetch(
              `${META_API_BASE}/${adAccountId}/ads?access_token=${input.accessToken}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: adFormData.toString(),
              }
            );
            
            console.log(`[STEP 4.${adIndex}e] Response status: ${adResponse.status}`);
            
            if (!adResponse.ok) {
              const errorText = await adResponse.text();
              console.error(`[STEP 4.${adIndex}e] ERROR - Ad creation failed!`);
              console.error(`[STEP 4.${adIndex}e] Response status: ${adResponse.status}`);
              console.error(`[STEP 4.${adIndex}e] Raw response: ${errorText}`);
              let error;
              try {
                error = JSON.parse(errorText);
                console.error(`[STEP 4.${adIndex}e] Error message: ${error.error?.message}`);
                console.error(`[STEP 4.${adIndex}e] Error code: ${error.error?.code}`);
                console.error(`[STEP 4.${adIndex}e] Error subcode: ${error.error?.error_subcode}`);
                console.error(`[STEP 4.${adIndex}e] Error user msg: ${error.error?.error_user_msg}`);
                console.error(`[STEP 4.${adIndex}e] fbtrace_id: ${error.error?.fbtrace_id}`);
              } catch {
                error = { error: { message: errorText } };
              }
              throw new Error(`Failed to create ad: ${error.error?.error_user_msg || error.error?.message || "Unknown error"}`);
            }
            
            const newAd = await adResponse.json();
            console.log(`[STEP 4.${adIndex}e] SUCCESS - Ad created!`);
            console.log(`[STEP 4.${adIndex}e] Ad ID: ${newAd.id}`);
            console.log(`[STEP 4.${adIndex}e] Full response: ${JSON.stringify(newAd, null, 2)}`);
            
            // STEP 4f: Get post URL from creative's effective_object_story_id with retry logic
            let postUrl = "";
            let commentPosted = false;
            let effectiveObjectStoryId = "";
            
            // Retry delays: 2s, then 5s, then 5s (total max 12s wait)
            const retryDelays = [2000, 5000, 5000];
            
            try {
              console.log(`\n[STEP 4.${adIndex}f] -------- GETTING POST URL (with retry) --------`);
              
              for (let retryAttempt = 0; retryAttempt <= retryDelays.length; retryAttempt++) {
                // Wait before checking (except first attempt)
                if (retryAttempt > 0) {
                  const delay = retryDelays[retryAttempt - 1];
                  console.log(`[STEP 4.${adIndex}f] Waiting ${delay/1000}s before retry ${retryAttempt}...`);
                  await new Promise(resolve => setTimeout(resolve, delay));
                }
                
                const creativeDetails = await metaApiRequest(
                  `/${newCreative.id}?fields=effective_object_story_id`,
                  input.accessToken
                );
                console.log(`[STEP 4.${adIndex}f] Attempt ${retryAttempt + 1}: Creative details:`, JSON.stringify(creativeDetails, null, 2));
                
                if (creativeDetails.effective_object_story_id) {
                  effectiveObjectStoryId = creativeDetails.effective_object_story_id;
                  console.log(`[STEP 4.${adIndex}f] SUCCESS! Got effective_object_story_id: ${effectiveObjectStoryId}`);
                  break;
                } else {
                  console.log(`[STEP 4.${adIndex}f] Attempt ${retryAttempt + 1}: No effective_object_story_id yet...`);
                  if (retryAttempt === retryDelays.length) {
                    console.log(`[STEP 4.${adIndex}f] All ${retryDelays.length + 1} attempts exhausted. Proceeding without post URL.`);
                  }
                }
              }
              
              if (effectiveObjectStoryId) {
                // Format: PageID_PostID
                const [postPageId, postId] = effectiveObjectStoryId.split('_');
                postUrl = `https://www.facebook.com/${postPageId}/posts/${postId}/`;
                console.log(`[STEP 4.${adIndex}f] Post URL: ${postUrl}`);
                
                // STEP 4g: Post comment if provided - need Page Access Token!
                if (input.postComment && input.postComment.trim()) {
                  console.log(`\n[STEP 4.${adIndex}g] -------- POSTING COMMENT --------`);
                  console.log(`[STEP 4.${adIndex}g] Comment text: ${input.postComment.substring(0, 50)}...`);
                  console.log(`[STEP 4.${adIndex}g] Post Page ID: ${postPageId}`);
                  
                  // Get Page Access Token for posting comments
                  let pageAccessToken = input.accessToken; // Default to user token
                  try {
                    const pagesResponse = await metaApiRequest(
                      `/me/accounts?fields=id,access_token`,
                      input.accessToken
                    );
                    const targetPage = pagesResponse.data?.find((p: any) => p.id === postPageId);
                    if (targetPage?.access_token) {
                      pageAccessToken = targetPage.access_token;
                      console.log(`[STEP 4.${adIndex}g] Got Page Access Token for page ${postPageId}`);
                    } else {
                      console.log(`[STEP 4.${adIndex}g] Using User Access Token (page token not found)`);
                    }
                  } catch (pageTokenError) {
                    console.error(`[STEP 4.${adIndex}g] Error getting page token:`, pageTokenError);
                  }
                  
                  const commentResponse = await fetch(
                    `${META_API_BASE}/${effectiveObjectStoryId}/comments?access_token=${pageAccessToken}`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/x-www-form-urlencoded" },
                      body: new URLSearchParams({ message: input.postComment }).toString(),
                    }
                  );
                  
                  if (commentResponse.ok) {
                    const commentResult = await commentResponse.json();
                    console.log(`[STEP 4.${adIndex}g] Comment posted successfully! ID: ${commentResult.id}`);
                    commentPosted = true;
                  } else {
                    const commentError = await commentResponse.text();
                    console.error(`[STEP 4.${adIndex}g] Failed to post comment: ${commentError}`);
                  }
                }
              } else {
                console.log(`[STEP 4.${adIndex}f] No effective_object_story_id found after all retries`);
              }
            } catch (postError) {
              console.error(`[STEP 4.${adIndex}f] Error getting post URL:`, postError);
            }
            
            console.log(`\n[STEP 4.${adIndex}] ######## AD ${adIndex} COMPLETED SUCCESSFULLY ########\n`);
            
            results.push({ adName: ad.adName, success: true, adId: newAd.id, postUrl, commentPosted });
            adSuccess = true; // Mark as successful to exit retry loop
            
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : "Unknown error";
            lastError = errorMsg;
            console.error(`\n[STEP 4.${adIndex}] ######## AD ${adIndex} ATTEMPT ${attempt} FAILED ########`);
            console.error(`[STEP 4.${adIndex}] Error: ${errorMsg}`);
            console.error(`[STEP 4.${adIndex}] Full error:`, error);
            
            if (attempt < MAX_RETRIES) {
              console.log(`[STEP 4.${adIndex}] Will retry in 3 seconds...`);
            }
          }
          } // End of retry loop
          
          // If all retries failed, add to results
          if (!adSuccess) {
            console.error(`[STEP 4.${adIndex}] ######## AD ${adIndex} FAILED AFTER ${MAX_RETRIES} ATTEMPTS ########`);
            results.push({ 
              adName: ad.adName, 
              success: false, 
              error: `Failed after ${MAX_RETRIES} attempts: ${lastError}`
            });
          }
        }
        
        // STEP 5: Final summary
        console.log("\n" + "*".repeat(120));
        console.log("[STEP 5] ******** BATCH CREATE ADS - COMPLETED ********");
        console.log("[STEP 5] Ad Set ID:", newAdSet.id);
        console.log("[STEP 5] Ad Set Name:", input.newAdSetName);
        console.log("[STEP 5] Total ads processed:", results.length);
        console.log("[STEP 5] Successful:", results.filter(r => r.success).length);
        console.log("[STEP 5] Failed:", results.filter(r => !r.success).length);
        results.forEach((r, i) => {
          if (r.success) {
            console.log(`[STEP 5]   Ad ${i+1}: ${r.adName} - SUCCESS (ID: ${r.adId})`);
          } else {
            console.log(`[STEP 5]   Ad ${i+1}: ${r.adName} - FAILED: ${r.error}`);
          }
        });
        console.log("*".repeat(120) + "\n");
        
        return {
          adSetId: newAdSet.id,
          adSetName: input.newAdSetName,
          results,
        };
      }),
  }),

  // Google Drive API
  google: router({
    // Save Google token to DB
    saveToken: protectedProcedure
      .input(z.object({
        accessToken: z.string(),
        refreshToken: z.string().nullable(),
        expiresIn: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        await saveGoogleToken(
          ctx.user.openId,
          input.accessToken,
          input.refreshToken,
          input.expiresIn
        );
        
        return { success: true };
      }),

    // Get saved Google token
    getToken: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) return null;
      
      const tokenData = await getGoogleToken(ctx.user.openId);
      if (!tokenData) return null;
      
      // Check if token is expired
      const now = new Date();
      if (now > tokenData.expiry) {
        // Try to refresh using refresh token
        if (tokenData.refreshToken) {
          const newToken = await refreshGoogleAccessToken(tokenData.refreshToken);
          if (newToken) {
            // Save new access token
            await saveGoogleToken(
              ctx.user.openId,
              newToken.accessToken,
              tokenData.refreshToken,
              newToken.expiresIn
            );
            return {
              accessToken: newToken.accessToken,
              expiresIn: newToken.expiresIn,
            };
          }
        }
        // Token expired and couldn't refresh
        return null;
      }
      
      // Token still valid
      const remainingSeconds = Math.floor((tokenData.expiry.getTime() - now.getTime()) / 1000);
      return {
        accessToken: tokenData.accessToken,
        expiresIn: remainingSeconds,
      };
    }),

    // Clear Google token
    clearToken: protectedProcedure.mutation(async ({ ctx }) => {
      if (!ctx.user) throw new Error("Not authenticated");
      await clearGoogleToken(ctx.user.openId);
      return { success: true };
    }),

    // Download files from public Google Drive links and upload to Bunny CDN
    downloadPublicFiles: protectedProcedure
      .input(z.object({
        links: z.array(z.string()),
      }))
      .mutation(async ({ ctx, input }) => {
        console.log("[downloadPublicFiles] ====== START ======");
        console.log("[downloadPublicFiles] Total links:", input.links.length);
        
        if (!ctx.user) {
          throw new Error("Not authenticated");
        }
        
        const results: Array<{
          success: boolean;
          fileName: string;
          bunnyUrl?: string;
          bunnyPath?: string;
          fileType: 'video' | 'image';
          error?: string;
        }> = [];
        
        const GOOGLE_API_KEY = process.env.VITE_GOOGLE_API_KEY;
        
        for (let i = 0; i < input.links.length; i++) {
          const link = input.links[i].trim();
          console.log(`[downloadPublicFiles] Processing ${i + 1}/${input.links.length}: ${link}`);
          
          try {
            // Extract file ID from various Google Drive URL formats
            // Format 1: https://drive.google.com/file/d/FILE_ID/view
            // Format 2: https://drive.google.com/open?id=FILE_ID
            // Format 3: https://drive.google.com/uc?id=FILE_ID
            let fileId: string | null = null;
            
            const fileIdMatch = link.match(/\/d\/([a-zA-Z0-9_-]+)/);
            if (fileIdMatch) {
              fileId = fileIdMatch[1];
            } else {
              const idParamMatch = link.match(/[?&]id=([a-zA-Z0-9_-]+)/);
              if (idParamMatch) {
                fileId = idParamMatch[1];
              }
            }
            
            if (!fileId) {
              console.error(`[downloadPublicFiles] Could not extract file ID from: ${link}`);
              results.push({
                success: false,
                fileName: 'unknown',
                fileType: 'video',
                error: 'Invalid Google Drive URL format',
              });
              continue;
            }
            
            console.log(`[downloadPublicFiles] File ID: ${fileId}`);
            
            // NO Google API - it doesn't work with "Anyone with the link" files
            // Instead, we fetch the download page and extract info from there
            
            console.log(`[downloadPublicFiles] Downloading from Google Drive...`);
            
            // Step 1: Fetch the download page to get file info and UUID (for large files)
            const warningUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
            console.log(`[downloadPublicFiles] Fetching download page: ${warningUrl}`);
            
            const warningResponse = await fetch(warningUrl);
            const warningHtml = await warningResponse.text();
            
            // Extract filename from the page
            // Pattern: <a href="/open?id=...">FILENAME</a> (SIZE)
            let fileName = `file_${fileId}`;
            const fileNameMatch = warningHtml.match(/<a href="\/open\?id=[^"]+">([^<]+)<\/a>/);
            if (fileNameMatch) {
              fileName = fileNameMatch[1];
              console.log(`[downloadPublicFiles] Extracted filename from page: ${fileName}`);
            } else {
              console.log(`[downloadPublicFiles] Could not extract filename, using default: ${fileName}`);
            }
            
            // Determine file type from extension
            const ext = fileName.split('.').pop()?.toLowerCase() || '';
            const videoExtensions = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'flv', 'm4v'];
            const isVideo = videoExtensions.includes(ext);
            const fileType: 'video' | 'image' = isVideo ? 'video' : 'image';
            const mimeType = isVideo ? 'video/mp4' : 'image/jpeg';
            
            let downloadResponse: Response | undefined;
            let buffer: Buffer | undefined;
            
            // Check if we got a warning page (contains virus scan warning)
            if (warningHtml.includes('Virus scan warning') || warningHtml.includes('uuid=')) {
              console.log(`[downloadPublicFiles] Got virus scan warning page, extracting UUID...`);
              
              // Extract UUID from the form
              const uuidMatch = warningHtml.match(/name="uuid"\s+value="([^"]+)"/);
              
              if (!uuidMatch) {
                console.error(`[downloadPublicFiles] Could not extract UUID from warning page`);
                results.push({
                  success: false,
                  fileName,
                  fileType,
                  error: 'Could not bypass virus scan warning',
                });
                continue;
              }
              
              const uuid = uuidMatch[1];
              console.log(`[downloadPublicFiles] Extracted UUID: ${uuid}`);
              
              // Step 2: Download with confirm and UUID
              const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t&uuid=${uuid}`;
              console.log(`[downloadPublicFiles] Downloading with UUID: ${downloadUrl}`);
              
              downloadResponse = await fetch(downloadUrl);
            } else {
              // Small file - check if we got the actual file or need to use API
              const contentType = warningResponse.headers.get('content-type');
              
              if (contentType && !contentType.includes('text/html')) {
                // We got the actual file directly
                console.log(`[downloadPublicFiles] Got file directly (small file)`);
                const arrayBuffer = await warningResponse.arrayBuffer();
                buffer = Buffer.from(arrayBuffer);
              } else {
                // Try the direct download URL
                const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
                console.log(`[downloadPublicFiles] Trying direct download: ${downloadUrl}`);
                downloadResponse = await fetch(downloadUrl);
              }
            }
            
            // Get the file buffer if we haven't already
            if (!buffer) {
              if (!downloadResponse!.ok) {
                const errorText = await downloadResponse!.text();
                console.error(`[downloadPublicFiles] Download failed: ${downloadResponse!.status} ${errorText}`);
                results.push({
                  success: false,
                  fileName,
                  fileType,
                  error: `Download failed: ${downloadResponse!.status}`,
                });
                continue;
              }
              
              // Check if we got HTML instead of the file
              const contentType = downloadResponse!.headers.get('content-type');
              if (contentType && contentType.includes('text/html')) {
                const html = await downloadResponse!.text();
                console.error(`[downloadPublicFiles] Got HTML instead of file:`, html.slice(0, 500));
                results.push({
                  success: false,
                  fileName,
                  fileType,
                  error: 'Got HTML page instead of file - file may not be publicly accessible',
                });
                continue;
              }
              
              const arrayBuffer = await downloadResponse!.arrayBuffer();
              buffer = Buffer.from(arrayBuffer);
            }
            
            console.log(`[downloadPublicFiles] Downloaded ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
            
            // Upload to Bunny CDN
            console.log(`[downloadPublicFiles] Uploading to Bunny CDN...`);
            const bunnyResult = await uploadBufferToBunny(
              fileName,
              buffer,
              mimeType,
              ctx.user.openId
            );
            
            if (!bunnyResult.success) {
              console.error(`[downloadPublicFiles] Bunny upload failed:`, bunnyResult.error);
              results.push({
                success: false,
                fileName,
                fileType,
                error: bunnyResult.error || 'Bunny upload failed',
              });
              continue;
            }
            
            console.log(`[downloadPublicFiles] Uploaded to Bunny: ${bunnyResult.cdnUrl}`);
            
            results.push({
              success: true,
              fileName,
              bunnyUrl: bunnyResult.cdnUrl,
              bunnyPath: bunnyResult.path,
              fileType,
            });
            
          } catch (error: any) {
            console.error(`[downloadPublicFiles] Error processing link:`, error);
            results.push({
              success: false,
              fileName: 'unknown',
              fileType: 'video',
              error: error.message || 'Unknown error',
            });
          }
        }
        
        console.log("[downloadPublicFiles] ====== COMPLETE ======");
        console.log(`[downloadPublicFiles] Success: ${results.filter(r => r.success).length}/${results.length}`);
        
        return { results };
      }),

    // Fetch files from Google Drive URLs using Bunny Stream's videos/fetch endpoint
    // Server only sends URL to Bunny - no bytes proxied through our server
    bunnyFetchFiles: protectedProcedure
      .input(z.object({
        links: z.array(z.string()),
        waitForProcessing: z.boolean().optional().default(false),
      }))
      .mutation(async ({ ctx, input }) => {
        console.log("[bunnyFetchFiles] ====== START ======");
        console.log("[bunnyFetchFiles] Total links:", input.links.length);
        console.log("[bunnyFetchFiles] Wait for processing:", input.waitForProcessing);
        
        if (!ctx.user) {
          throw new Error("Not authenticated");
        }
        
        // Check if Bunny Stream is configured
        if (!isBunnyStreamConfigured()) {
          throw new Error("Bunny Stream is not configured. Please set BUNNY_STREAM_API_KEY, BUNNY_STREAM_LIBRARY_ID, and BUNNY_STREAM_CDN_HOSTNAME environment variables.");
        }
        
        const results: Array<{
          success: boolean;
          fileName: string;
          videoGuid?: string;
          directPlayUrl?: string;
          thumbnailUrl?: string;
          status?: string;
          error?: string;
        }> = [];
        
        const GOOGLE_API_KEY = process.env.VITE_GOOGLE_API_KEY;
        
        for (let i = 0; i < input.links.length; i++) {
          const link = input.links[i].trim();
          console.log(`[bunnyFetchFiles] Processing ${i + 1}/${input.links.length}: ${link}`);
          
          try {
            // Extract file ID from various Google Drive URL formats
            let fileId: string | null = null;
            
            const fileIdMatch = link.match(/\/d\/([a-zA-Z0-9_-]+)/);
            if (fileIdMatch) {
              fileId = fileIdMatch[1];
            } else {
              const idParamMatch = link.match(/[?&]id=([a-zA-Z0-9_-]+)/);
              if (idParamMatch) {
                fileId = idParamMatch[1];
              }
            }
            
            if (!fileId) {
              console.error(`[bunnyFetchFiles] Could not extract file ID from: ${link}`);
              results.push({
                success: false,
                fileName: 'unknown',
                error: 'Invalid Google Drive URL format',
              });
              continue;
            }
            
            console.log(`[bunnyFetchFiles] File ID: ${fileId}`);
            
            // Get file metadata from Google Drive API to get the filename
            const metadataUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?key=${GOOGLE_API_KEY}&fields=name,mimeType`;
            console.log(`[bunnyFetchFiles] Fetching metadata from: ${metadataUrl}`);
            const metadataResponse = await fetch(metadataUrl);
            const metadata = await metadataResponse.json();
            console.log(`[bunnyFetchFiles] Metadata response:`, JSON.stringify(metadata));
            
            let fileName = `video_${fileId}`;
            if (metadata.name) {
              fileName = metadata.name;
              console.log(`[bunnyFetchFiles] Got filename from API: ${fileName}`);
            } else if (metadata.error) {
              console.warn(`[bunnyFetchFiles] Could not get metadata:`, metadata.error.message);
              // Try alternative: use file ID as fallback
              console.log(`[bunnyFetchFiles] Using fallback filename: ${fileName}`);
            }
            
            console.log(`[bunnyFetchFiles] File name: ${fileName}`);
            
            // Construct the direct download URL for Google Drive
            const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
            
            console.log(`[bunnyFetchFiles] Sending to Bunny Stream: ${downloadUrl}`);
            
            // Call Bunny Stream's fetch endpoint
            const fetchResult = await bunnyStreamFetchVideo(downloadUrl, fileName);
            
            if (!fetchResult.success) {
              console.error(`[bunnyFetchFiles] Bunny fetch failed:`, fetchResult.error);
              results.push({
                success: false,
                fileName,
                error: fetchResult.error || 'Bunny Stream fetch failed',
              });
              continue;
            }
            
            console.log(`[bunnyFetchFiles] Bunny fetch initiated - GUID: ${fetchResult.videoGuid}`);
            
            // If waitForProcessing is true, poll until video is ready
            if (input.waitForProcessing && fetchResult.videoGuid) {
              console.log(`[bunnyFetchFiles] Waiting for video to finish processing...`);
              const videoStatus = await bunnyStreamWaitForVideo(fetchResult.videoGuid, 60, 3000); // 60 attempts, 3s each = 3 minutes max
              
              if (videoStatus) {
                results.push({
                  success: true,
                  fileName,
                  videoGuid: fetchResult.videoGuid,
                  directPlayUrl: videoStatus.directPlayUrl,
                  thumbnailUrl: videoStatus.thumbnailUrl,
                  status: 'finished',
                });
              } else {
                results.push({
                  success: false,
                  fileName,
                  videoGuid: fetchResult.videoGuid,
                  error: 'Video processing timed out or failed',
                  status: 'timeout',
                });
              }
            } else {
              // Return immediately without waiting
              results.push({
                success: true,
                fileName,
                videoGuid: fetchResult.videoGuid,
                status: 'processing',
              });
            }
            
          } catch (error: any) {
            console.error(`[bunnyFetchFiles] Error processing link:`, error);
            results.push({
              success: false,
              fileName: 'unknown',
              error: error.message || 'Unknown error',
            });
          }
        }
        
        console.log("[bunnyFetchFiles] ====== COMPLETE ======");
        console.log(`[bunnyFetchFiles] Success: ${results.filter(r => r.success).length}/${results.length}`);
        
        return { results };
      }),

    // Check status of a Bunny Stream video
    checkBunnyVideoStatus: protectedProcedure
      .input(z.object({
        videoGuid: z.string(),
      }))
      .query(async ({ input }) => {
        const status = await bunnyStreamWaitForVideo(input.videoGuid, 1, 0); // Just check once, no waiting
        return status;
      }),

    // Exchange authorization code for tokens (with refresh token)
    exchangeCode: protectedProcedure
      .input(z.object({
        code: z.string(),
        redirectUri: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        console.log("[exchangeCode] ====== START ======");
        console.log("[exchangeCode] redirectUri:", input.redirectUri);
        console.log("[exchangeCode] code length:", input.code?.length);
        
        if (!ctx.user) {
          console.error("[exchangeCode] ERROR: Not authenticated");
          throw new Error("Not authenticated");
        }
        
        const clientId = process.env.VITE_GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        
        console.log("[exchangeCode] clientId exists:", !!clientId);
        console.log("[exchangeCode] clientSecret exists:", !!clientSecret);
        
        if (!clientId || !clientSecret) {
          console.error("[exchangeCode] ERROR: Google credentials not configured");
          throw new Error("Google credentials not configured");
        }
        
        console.log("[exchangeCode] Calling Google token endpoint...");
        
        // Exchange code for tokens
        const response = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code: input.code,
            redirect_uri: input.redirectUri,
            grant_type: 'authorization_code',
          }),
        });
        
        const data = await response.json();
        
        console.log("[exchangeCode] Google response status:", response.status);
        console.log("[exchangeCode] Google response data:", JSON.stringify(data, null, 2));
        
        if (data.error) {
          console.error("[exchangeCode] ERROR from Google:", data.error, data.error_description);
          throw new Error(data.error_description || data.error);
        }
        
        console.log("[exchangeCode] Got access_token:", !!data.access_token);
        console.log("[exchangeCode] Got refresh_token:", !!data.refresh_token);
        console.log("[exchangeCode] Saving tokens to DB...");
        
        // Save tokens to DB
        await saveGoogleToken(
          ctx.user.openId,
          data.access_token,
          data.refresh_token || null,
          data.expires_in || 3600
        );
        
        return {
          accessToken: data.access_token,
          expiresIn: data.expires_in || 3600,
          hasRefreshToken: !!data.refresh_token,
        };
      }),
  }),

  // Presets router for saving URL/Headline/FB Page combinations
  presets: router({
    // Get all presets for current user
    getAll: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) {
        return [];
      }
      
      const userPresets = await db
        .select()
        .from(adPresets)
        .where(eq(adPresets.userId, ctx.user.id));
      
      return userPresets;
    }),

    // Create a new preset
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        headline: z.string().optional(),
        url: z.string().optional(),
        fbPageId: z.string().optional(),
        fbPageName: z.string().optional(),
        postComment: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) {
          throw new Error("Database not available");
        }
        
        const result = await db.insert(adPresets).values({
          userId: ctx.user.id,
          name: input.name,
          headline: input.headline || null,
          url: input.url || null,
          fbPageId: input.fbPageId || null,
          fbPageName: input.fbPageName || null,
          postComment: input.postComment || null,
        });
        
        return { success: true, id: Number(result[0].insertId) };
      }),

    // Update a preset
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        headline: z.string().optional(),
        url: z.string().optional(),
        fbPageId: z.string().optional(),
        fbPageName: z.string().optional(),
        postComment: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) {
          throw new Error("Database not available");
        }
        
        const updateData: Record<string, string | null> = {};
        if (input.name !== undefined) updateData.name = input.name;
        if (input.headline !== undefined) updateData.headline = input.headline || null;
        if (input.url !== undefined) updateData.url = input.url || null;
        if (input.fbPageId !== undefined) updateData.fbPageId = input.fbPageId || null;
        if (input.fbPageName !== undefined) updateData.fbPageName = input.fbPageName || null;
        if (input.postComment !== undefined) updateData.postComment = input.postComment || null;
        
        await db
          .update(adPresets)
          .set(updateData)
          .where(and(eq(adPresets.id, input.id), eq(adPresets.userId, ctx.user.id)));
        
        return { success: true };
      }),

    // Delete a preset
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) {
          throw new Error("Database not available");
        }
        
        await db
          .delete(adPresets)
          .where(and(eq(adPresets.id, input.id), eq(adPresets.userId, ctx.user.id)));
        
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
