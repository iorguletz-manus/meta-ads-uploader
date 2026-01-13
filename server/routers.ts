import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
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
        
        // Create JWT token
        const secret = new TextEncoder().encode(ENV.cookieSecret);
        const token = await new SignJWT({ 
          sub: "fixed-user",
          openId: "fixed-user-id",
          name: FIXED_USERNAME,
        })
          .setProtectedHeader({ alg: "HS256" })
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
    // Get ad accounts for the user
    getAdAccounts: protectedProcedure
      .input(z.object({ accessToken: z.string() }))
      .query(async ({ input }) => {
        const data = await metaApiRequest("/me/adaccounts?fields=id,name,account_status", input.accessToken);
        return data.data as Array<{ id: string; name: string; account_status: number }>;
      }),

    // Get campaigns for an ad account
    getCampaigns: protectedProcedure
      .input(z.object({ accessToken: z.string(), adAccountId: z.string().optional() }))
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
        return data.data as Array<{ id: string; name: string; status: string; objective: string }>;
      }),

    // Get ad sets for a campaign
    getAdSets: protectedProcedure
      .input(z.object({ accessToken: z.string(), campaignId: z.string() }))
      .query(async ({ input }) => {
        const data = await metaApiRequest(
          `/${input.campaignId}/adsets?fields=id,name,status,daily_budget,lifetime_budget,targeting&limit=100`,
          input.accessToken
        );
        return data.data as Array<{
          id: string;
          name: string;
          status: string;
          daily_budget?: string;
          lifetime_budget?: string;
          targeting?: unknown;
        }>;
      }),

    // Get ads for an ad set
    getAds: protectedProcedure
      .input(z.object({ accessToken: z.string(), adSetId: z.string() }))
      .query(async ({ input }) => {
        const data = await metaApiRequest(
          `/${input.adSetId}/ads?fields=id,name,status,creative&limit=100`,
          input.accessToken
        );
        return data.data as Array<{
          id: string;
          name: string;
          status: string;
          creative?: { id: string };
        }>;
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
        // Step 1: Upload all images
        const uploadedImages: Array<{ hash: string; aspectRatio: string }> = [];
        
        for (const image of input.images) {
          if (!image.base64) continue;
          
          const imageFormData = new URLSearchParams();
          imageFormData.append("bytes", image.base64);
          imageFormData.append("name", image.filename);
          
          const imageResponse = await fetch(
            `${META_API_BASE}/${input.adAccountId}/adimages?access_token=${input.accessToken}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: imageFormData.toString(),
            }
          );
          
          if (!imageResponse.ok) {
            const error = await imageResponse.json();
            throw new Error(`Failed to upload image ${image.filename}: ${error.error?.message || "Unknown error"}`);
          }
          
          const imageResult = await imageResponse.json();
          const imageKey = Object.keys(imageResult.images)[0];
          uploadedImages.push({
            hash: imageResult.images[imageKey].hash,
            aspectRatio: image.aspectRatio,
          });
        }
        
        if (uploadedImages.length === 0) {
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
          
          creativeData = {
            name: `${input.adName}_creative`,
            object_story_spec: JSON.stringify({
              page_id: input.pageId,
              link_data: {
                message: input.primaryText,
                name: input.headline,
                link: input.url,
                call_to_action: { type: "LEARN_MORE" },
                image_hash: uploadedImages[0].hash,
              },
            }),
            asset_feed_spec: JSON.stringify(assetFeedSpec),
          };
        } else {
          // Single image - simple creative
          creativeData = {
            name: `${input.adName}_creative`,
            object_story_spec: JSON.stringify({
              page_id: input.pageId,
              link_data: {
                message: input.primaryText,
                name: input.headline,
                link: input.url,
                call_to_action: { type: "LEARN_MORE" },
                image_hash: uploadedImages[0].hash,
              },
            }),
          };
        }
        
        const creativeFormData = new URLSearchParams();
        Object.entries(creativeData).forEach(([key, value]) => {
          creativeFormData.append(key, value);
        });
        
        const creativeResponse = await fetch(
          `${META_API_BASE}/${input.adAccountId}/adcreatives?access_token=${input.accessToken}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: creativeFormData.toString(),
          }
        );
        
        if (!creativeResponse.ok) {
          const error = await creativeResponse.json();
          throw new Error(`Failed to create creative: ${error.error?.message || "Unknown error"}`);
        }
        
        const newCreative = await creativeResponse.json();
        
        // Step 3: Create the ad
        const adData = {
          name: input.adName,
          adset_id: input.adSetId,
          creative: JSON.stringify({ creative_id: newCreative.id }),
          status: "PAUSED",
        };
        
        const adFormData = new URLSearchParams();
        Object.entries(adData).forEach(([key, value]) => {
          adFormData.append(key, value);
        });
        
        const adResponse = await fetch(
          `${META_API_BASE}/${input.adAccountId}/ads?access_token=${input.accessToken}`,
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
        ads: z.array(z.object({
          adName: z.string(),
          primaryText: z.string(),
          headline: z.string(),
          url: z.string(),
          images: z.array(z.object({
            filename: z.string(),
            aspectRatio: z.string(),
            base64: z.string(),
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
          `/${originalAdSetId}?fields=campaign_id,targeting,billing_event,optimization_goal,bid_amount,daily_budget,lifetime_budget,promoted_object`,
          input.accessToken
        );
        
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
        if (originalAdSet.promoted_object) {
          newAdSetData.promoted_object = JSON.stringify(originalAdSet.promoted_object);
        }
        
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
          throw new Error(`Failed to create ad set: ${error.error?.message || "Unknown error"}`);
        }
        
        const newAdSet = await adSetResponse.json();
        
        // Step 2: Create each ad in the new ad set
        const results: Array<{ adName: string; success: boolean; adId?: string; error?: string }> = [];
        
        for (const ad of input.ads) {
          try {
            // Upload images for this ad
            const uploadedImages: Array<{ hash: string; aspectRatio: string }> = [];
            
            for (const image of ad.images) {
              if (!image.base64) continue;
              
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
                const error = await imageResponse.json();
                throw new Error(`Failed to upload image: ${error.error?.message || "Unknown error"}`);
              }
              
              const imageResult = await imageResponse.json();
              const imageKey = Object.keys(imageResult.images)[0];
              uploadedImages.push({
                hash: imageResult.images[imageKey].hash,
                aspectRatio: image.aspectRatio,
              });
            }
            
            if (uploadedImages.length === 0) {
              throw new Error("No images were uploaded");
            }
            
            // Create creative
            const creativeData = {
              name: `${ad.adName}_creative`,
              object_story_spec: JSON.stringify({
                page_id: pageId,
                link_data: {
                  message: ad.primaryText,
                  name: ad.headline,
                  link: ad.url,
                  call_to_action: { type: "LEARN_MORE" },
                  image_hash: uploadedImages[0].hash,
                },
              }),
            };
            
            const creativeFormData = new URLSearchParams();
            Object.entries(creativeData).forEach(([key, value]) => {
              creativeFormData.append(key, value);
            });
            
            const creativeResponse = await fetch(
              `${META_API_BASE}/${adAccountId}/adcreatives?access_token=${input.accessToken}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: creativeFormData.toString(),
              }
            );
            
            if (!creativeResponse.ok) {
              const error = await creativeResponse.json();
              throw new Error(`Failed to create creative: ${error.error?.message || "Unknown error"}`);
            }
            
            const newCreative = await creativeResponse.json();
            
            // Create ad
            const adData = {
              name: ad.adName,
              adset_id: newAdSet.id,
              creative: JSON.stringify({ creative_id: newCreative.id }),
              status: "PAUSED",
            };
            
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
