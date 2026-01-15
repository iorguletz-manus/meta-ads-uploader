import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { saveFacebookToken, getFacebookToken, clearFacebookToken, saveAdAccountSettings, getAdAccountSettings } from "./db";
import { uploadToBunny, deleteFromBunny } from "./bunnyStorage";
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
    // Save Facebook token to database
    saveFacebookToken: protectedProcedure
      .input(z.object({ accessToken: z.string(), expiresIn: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        console.log("[saveFacebookToken] Saving token for openId:", ctx.user.openId);
        await saveFacebookToken(ctx.user.openId, input.accessToken, input.expiresIn);
        console.log("[saveFacebookToken] Token saved successfully");
        return { success: true };
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

    // Delete media from Bunny.net CDN
    deleteFromBunny: protectedProcedure
      .input(z.object({ filePath: z.string() }))
      .mutation(async ({ input }) => {
        const success = await deleteFromBunny(input.filePath);
        return { success };
      }),

    // Get ad accounts for the user
    getAdAccounts: protectedProcedure
      .input(z.object({ accessToken: z.string() }))
      .query(async ({ input }) => {
        const data = await metaApiRequest("/me/adaccounts?fields=id,name,account_status", input.accessToken);
        return data.data as Array<{ id: string; name: string; account_status: number }>;
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
        // Get ad with creative
        const ad = await metaApiRequest(
          `/${input.adId}?fields=id,name,status,creative{id,name,object_story_spec,asset_feed_spec}`,
          input.accessToken
        );
        
        let primaryText = "";
        let headline = "";
        let url = "";
        
        // Extract text from creative
        if (ad.creative?.object_story_spec?.link_data) {
          const linkData = ad.creative.object_story_spec.link_data;
          primaryText = linkData.message || "";
          headline = linkData.name || linkData.caption || "";
          url = linkData.link || "";
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
        }
        
        return {
          id: ad.id,
          name: ad.name,
          status: ad.status,
          creativeId: ad.creative?.id,
          primaryText,
          headline,
          url,
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
          };
        } else {
          // Single image - simple creative
          console.log("[STEP 2] Using single image creative (no asset_feed_spec)");
          creativeData = {
            name: `${input.adName}_creative`,
            object_story_spec: JSON.stringify(objectStorySpec),
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
        ads: z.array(z.object({
          adName: z.string(),
          primaryText: z.string(),
          headline: z.string(),
          url: z.string(),
          media: z.array(z.object({
            filename: z.string(),
            aspectRatio: z.string(),
            base64: z.string(),
            type: z.enum(["image", "video"]),
          })),
        })),
      }))
      .mutation(async ({ input }) => {
        // Get template info
        const templateAd = await metaApiRequest(
          `/${input.templateAdId}?fields=adset_id,account_id,creative{object_story_spec}`,
          input.accessToken
        );
        
        const adAccountId = `act_${templateAd.account_id}`;
        const originalAdSetId = templateAd.adset_id;
        
        // Extract page ID from creative
        let pageId = "";
        if (templateAd.creative?.object_story_spec?.page_id) {
          pageId = templateAd.creative.object_story_spec.page_id;
        }
        
        if (!pageId) {
          throw new Error("Could not determine page ID from template ad");
        }
        
        // Step 1: Duplicate the ad set ONCE
        const originalAdSet = await metaApiRequest(
          `/${originalAdSetId}?fields=campaign_id,targeting,billing_event,optimization_goal,bid_amount,bid_strategy,daily_budget,lifetime_budget,promoted_object,destination_type,attribution_spec,start_time,end_time`,
          input.accessToken
        );
        
        console.log("Original Ad Set data:", JSON.stringify(originalAdSet, null, 2));
        
        const newAdSetData: Record<string, string> = {
          name: input.newAdSetName,
          campaign_id: originalAdSet.campaign_id,
          status: "PAUSED",
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
        
        console.log("New Ad Set data to create:", JSON.stringify(newAdSetData, null, 2));
        
        const adSetFormData = new URLSearchParams();
        Object.entries(newAdSetData).forEach(([key, value]) => {
          adSetFormData.append(key, value);
        });
        
        const adSetResponse = await fetch(
          `${META_API_BASE}/${adAccountId}/adsets?access_token=${input.accessToken}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: adSetFormData.toString(),
          }
        );
        
        if (!adSetResponse.ok) {
          const error = await adSetResponse.json();
          console.error("Ad Set creation error:", JSON.stringify(error, null, 2));
          console.error("Request data:", JSON.stringify(newAdSetData, null, 2));
          throw new Error(`Failed to create ad set: ${error.error?.message || JSON.stringify(error)}`);
        }
        
        const newAdSet = await adSetResponse.json();
        
        // Step 2: Create each ad in the new ad set
        const results: Array<{ adName: string; success: boolean; adId?: string; error?: string }> = [];
        
        for (const ad of input.ads) {
          try {
            console.log("\n" + "=".repeat(60));
            console.log(`[BATCH] Processing ad: ${ad.adName}`);
            console.log(`[BATCH] Media count: ${ad.media.length}`);
            ad.media.forEach((m, i) => {
              console.log(`[BATCH] Media ${i + 1}: ${m.filename} (${m.type}, ${m.aspectRatio})`);
              console.log(`[BATCH]   base64 length: ${m.base64?.length || 0}`);
              if (m.base64) {
                console.log(`[BATCH]   base64 preview: ${m.base64.substring(0, 50)}...`);
              }
            });
            
            // Separate images and videos
            const images = ad.media.filter(m => m.type === "image");
            const videos = ad.media.filter(m => m.type === "video");
            
            console.log(`[BATCH] Images: ${images.length}, Videos: ${videos.length}`);
            
            // Upload images
            const uploadedImages: Array<{ hash: string; aspectRatio: string }> = [];
            for (const image of images) {
              if (!image.base64) {
                console.log(`[BATCH] Skipping image ${image.filename} - no base64 data`);
                continue;
              }
              
              console.log(`[BATCH] Uploading image: ${image.filename}`);
              const imageFormData = new URLSearchParams();
              imageFormData.append("bytes", image.base64);
              imageFormData.append("name", image.filename);
              
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
                console.error(`[BATCH] Image upload failed: ${errorText}`);
                let error;
                try {
                  error = JSON.parse(errorText);
                } catch {
                  error = { error: { message: errorText } };
                }
                throw new Error(`Failed to upload image: ${error.error?.message || "Unknown error"}`);
              }
              
              const imageResult = await imageResponse.json();
              const imageKey = Object.keys(imageResult.images)[0];
              console.log(`[BATCH] Image uploaded successfully: hash=${imageResult.images[imageKey].hash}`);
              uploadedImages.push({
                hash: imageResult.images[imageKey].hash,
                aspectRatio: image.aspectRatio,
              });
            }
            
            // Upload videos (using resumable upload API)
            const uploadedVideos: Array<{ id: string; aspectRatio: string }> = [];
            for (const video of videos) {
              if (!video.base64) continue;
              
              // For videos, we need to use the ad account's advideos endpoint
              const videoFormData = new URLSearchParams();
              // Convert base64 to file_url approach or use source parameter
              // Meta API accepts base64 encoded video in 'source' parameter
              videoFormData.append("source", `data:video/mp4;base64,${video.base64}`);
              videoFormData.append("title", video.filename);
              
              const videoResponse = await fetch(
                `${META_API_BASE}/${adAccountId}/advideos?access_token=${input.accessToken}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/x-www-form-urlencoded" },
                  body: videoFormData.toString(),
                }
              );
              
              if (!videoResponse.ok) {
                const error = await videoResponse.json();
                throw new Error(`Failed to upload video: ${error.error?.message || "Unknown error"}`);
              }
              
              const videoResult = await videoResponse.json();
              uploadedVideos.push({
                id: videoResult.id,
                aspectRatio: video.aspectRatio,
              });
            }
            
            if (uploadedImages.length === 0 && uploadedVideos.length === 0) {
              console.error(`[BATCH] ERROR: No media was uploaded for ad ${ad.adName}`);
              console.error(`[BATCH] Images attempted: ${images.length}, Videos attempted: ${videos.length}`);
              throw new Error("No media was uploaded");
            }
            
            // Create creative - use video if available, otherwise image
            let creativeData: Record<string, string>;
            
            if (uploadedVideos.length > 0) {
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
                    // Use first image as thumbnail if available
                    ...(uploadedImages.length > 0 && { image_hash: uploadedImages[0].hash }),
                  },
                }),
              };
            } else {
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
              };
            }
            
            const creativeFormData = new URLSearchParams();
            Object.entries(creativeData).forEach(([key, value]) => {
              creativeFormData.append(key, value);
            });
            
            console.log("=" .repeat(80));
            console.log("[CREATIVE] Creating creative with data:");
            console.log("[CREATIVE] name:", creativeData.name);
            console.log("[CREATIVE] object_story_spec:", creativeData.object_story_spec);
            console.log("[CREATIVE] Parsed object_story_spec:", JSON.stringify(JSON.parse(creativeData.object_story_spec), null, 2));
            console.log("=" .repeat(80));
            
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
              console.error("=" .repeat(80));
              console.error("[CREATIVE ERROR] Response status:", creativeResponse.status);
              console.error("[CREATIVE ERROR] Response text:", errorText);
              console.error("[CREATIVE ERROR] Creative data sent:");
              console.error("[CREATIVE ERROR]   name:", creativeData.name);
              console.error("[CREATIVE ERROR]   object_story_spec:", creativeData.object_story_spec);
              console.error("=" .repeat(80));
              let error;
              try {
                error = JSON.parse(errorText);
              } catch {
                error = { error: { message: errorText } };
              }
              throw new Error(`Failed to create creative: ${error.error?.message || JSON.stringify(error)}`);
            }
            
            const newCreative = await creativeResponse.json();
            
            // Create ad with optional scheduling
            const adData: Record<string, string> = {
              name: ad.adName,
              adset_id: newAdSet.id,
              creative: JSON.stringify({ creative_id: newCreative.id }),
              status: "PAUSED",
            };
            
            // Add scheduled time if provided (convert to Unix timestamp)
            if (input.scheduledTime) {
              const scheduledDate = new Date(input.scheduledTime);
              adData.configured_status = "ACTIVE";
              // Meta API expects Unix timestamp in seconds
              adData.effective_status = "SCHEDULED";
            }
            
            const adFormData = new URLSearchParams();
            Object.entries(adData).forEach(([key, value]) => {
              adFormData.append(key, value);
            });
            
            const adResponse = await fetch(
              `${META_API_BASE}/${adAccountId}/ads?access_token=${input.accessToken}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: adFormData.toString(),
              }
            );
            
            if (!adResponse.ok) {
              const error = await adResponse.json();
              throw new Error(`Failed to create ad: ${error.error?.message || "Unknown error"}`);
            }
            
            const newAd = await adResponse.json();
            results.push({ adName: ad.adName, success: true, adId: newAd.id });
            
          } catch (error) {
            results.push({ 
              adName: ad.adName, 
              success: false, 
              error: error instanceof Error ? error.message : "Unknown error" 
            });
          }
        }
        
        return {
          adSetId: newAdSet.id,
          adSetName: input.newAdSetName,
          results,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
