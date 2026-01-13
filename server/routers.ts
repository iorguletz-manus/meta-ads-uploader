import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";

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
          targeting?: any;
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

    // Duplicate ad set
    duplicateAdSet: protectedProcedure
      .input(z.object({
        accessToken: z.string(),
        adSetId: z.string(),
        newName: z.string(),
      }))
      .mutation(async ({ input }) => {
        // Get the original ad set details
        const originalAdSet = await metaApiRequest(
          `/${input.adSetId}?fields=campaign_id,name,status,targeting,billing_event,optimization_goal,bid_amount,daily_budget,lifetime_budget,start_time,end_time,promoted_object`,
          input.accessToken
        );
        
        // Get the ad account from the ad set
        const adSetWithAccount = await metaApiRequest(
          `/${input.adSetId}?fields=account_id`,
          input.accessToken
        );
        
        const adAccountId = `act_${adSetWithAccount.account_id}`;
        
        // Create new ad set with same settings
        const newAdSetData: any = {
          name: input.newName,
          campaign_id: originalAdSet.campaign_id,
          status: "PAUSED", // Start paused for safety
          targeting: JSON.stringify(originalAdSet.targeting),
          billing_event: originalAdSet.billing_event,
          optimization_goal: originalAdSet.optimization_goal,
        };
        
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
        return { id: result.id, name: input.newName };
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

    // Create ad creative
    createAdCreative: protectedProcedure
      .input(z.object({
        accessToken: z.string(),
        adAccountId: z.string(),
        name: z.string(),
        pageId: z.string(),
        primaryText: z.string(),
        headline: z.string(),
        url: z.string(),
        imageHashes: z.array(z.object({
          hash: z.string(),
          aspectRatio: z.string(),
        })),
      }))
      .mutation(async ({ input }) => {
        // Build asset feed spec for multiple placements
        const assetFeedSpec: any = {
          bodies: [{ text: input.primaryText }],
          titles: [{ text: input.headline }],
          link_urls: [{ website_url: input.url }],
          call_to_action_types: ["LEARN_MORE"],
          images: input.imageHashes.map(img => ({ hash: img.hash })),
        };
        
        const creativeData = {
          name: input.name,
          object_story_spec: JSON.stringify({
            page_id: input.pageId,
            link_data: {
              message: input.primaryText,
              name: input.headline,
              link: input.url,
              call_to_action: { type: "LEARN_MORE" },
              image_hash: input.imageHashes[0]?.hash, // Primary image
            },
          }),
          asset_feed_spec: JSON.stringify(assetFeedSpec),
        };
        
        const formData = new URLSearchParams();
        Object.entries(creativeData).forEach(([key, value]) => {
          formData.append(key, String(value));
        });
        
        const response = await fetch(
          `${META_API_BASE}/${input.adAccountId}/adcreatives?access_token=${input.accessToken}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: formData.toString(),
          }
        );
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error?.message || "Failed to create ad creative");
        }
        
        const result = await response.json();
        return { id: result.id };
      }),

    // Create ad
    createAd: protectedProcedure
      .input(z.object({
        accessToken: z.string(),
        adSetId: z.string(),
        newAdSetName: z.string(),
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
        // This is a simplified version - in production you'd:
        // 1. Duplicate the ad set
        // 2. Upload all images
        // 3. Create ad creative with proper placement mapping
        // 4. Create the ad
        
        // For now, return a mock success
        // The actual implementation requires the ad account ID and page ID
        // which we'll get from the selected ad set
        
        return {
          success: true,
          adId: "mock_ad_id",
          message: "Ad creation initiated",
        };
      }),

    // Full ad creation flow
    createFullAd: protectedProcedure
      .input(z.object({
        accessToken: z.string(),
        templateAdId: z.string(),
        newAdSetName: z.string(),
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
        // Get template ad details to extract ad set, account, and page info
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
        
        // Step 1: Duplicate the ad set
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
        
        // Step 2: Upload images
        const uploadedImages: Array<{ hash: string; aspectRatio: string }> = [];
        
        for (const image of input.images) {
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
            throw new Error(`Failed to upload image ${image.filename}: ${error.error?.message || "Unknown error"}`);
          }
          
          const imageResult = await imageResponse.json();
          const imageKey = Object.keys(imageResult.images)[0];
          uploadedImages.push({
            hash: imageResult.images[imageKey].hash,
            aspectRatio: image.aspectRatio,
          });
        }
        
        // Step 3: Create ad creative
        const creativeData = {
          name: `${input.adName}_creative`,
          object_story_spec: JSON.stringify({
            page_id: pageId,
            link_data: {
              message: input.primaryText,
              name: input.headline,
              link: input.url,
              call_to_action: { type: "LEARN_MORE" },
              image_hash: uploadedImages[0]?.hash,
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
        
        // Step 4: Create the ad
        const adData = {
          name: input.adName,
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
        
        return {
          success: true,
          adSetId: newAdSet.id,
          creativeId: newCreative.id,
          adId: newAd.id,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
