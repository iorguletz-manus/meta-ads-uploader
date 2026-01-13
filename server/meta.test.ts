import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock fetch for Meta API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("meta.getCampaigns", () => {
  it("should fetch campaigns from Meta API", async () => {
    const mockCampaigns = {
      data: [
        { id: "123", name: "Test Campaign", status: "ACTIVE", objective: "CONVERSIONS" },
        { id: "456", name: "Another Campaign", status: "PAUSED", objective: "TRAFFIC" },
      ],
    };

    // Mock the ad accounts call first
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: "act_123456", name: "Test Account" }] }),
    });

    // Mock the campaigns call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockCampaigns,
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.meta.getCampaigns({
      accessToken: "test-token",
    });

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Test Campaign");
    expect(result[1].name).toBe("Another Campaign");
  });

  it("should throw error when no ad accounts found", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.meta.getCampaigns({ accessToken: "test-token" })
    ).rejects.toThrow("No ad accounts found");
  });
});

describe("meta.getAdSets", () => {
  it("should fetch ad sets for a campaign", async () => {
    const mockAdSets = {
      data: [
        { id: "adset_1", name: "Ad Set 1", status: "ACTIVE", daily_budget: "5000" },
        { id: "adset_2", name: "Ad Set 2", status: "PAUSED", lifetime_budget: "100000" },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockAdSets,
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.meta.getAdSets({
      accessToken: "test-token",
      campaignId: "campaign_123",
    });

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Ad Set 1");
    expect(result[0].daily_budget).toBe("5000");
  });
});

describe("meta.getAds", () => {
  it("should fetch ads for an ad set", async () => {
    const mockAds = {
      data: [
        { id: "ad_1", name: "Ad 1", status: "ACTIVE", creative: { id: "creative_1" } },
        { id: "ad_2", name: "Ad 2", status: "PAUSED", creative: { id: "creative_2" } },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockAds,
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.meta.getAds({
      accessToken: "test-token",
      adSetId: "adset_123",
    });

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Ad 1");
    expect(result[1].creative?.id).toBe("creative_2");
  });
});

describe("meta.getAdDetails", () => {
  it("should fetch ad details with creative info", async () => {
    const mockAdDetails = {
      id: "ad_123",
      name: "Test Ad",
      status: "ACTIVE",
      creative: {
        id: "creative_123",
        object_story_spec: {
          link_data: {
            message: "Check out our product!",
            name: "Amazing Product",
            link: "https://example.com/product",
          },
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockAdDetails,
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.meta.getAdDetails({
      accessToken: "test-token",
      adId: "ad_123",
    });

    expect(result.id).toBe("ad_123");
    expect(result.primaryText).toBe("Check out our product!");
    expect(result.headline).toBe("Amazing Product");
    expect(result.url).toBe("https://example.com/product");
  });

  it("should handle asset_feed_spec format", async () => {
    const mockAdDetails = {
      id: "ad_456",
      name: "Dynamic Ad",
      status: "ACTIVE",
      creative: {
        id: "creative_456",
        asset_feed_spec: {
          bodies: [{ text: "Dynamic body text" }],
          titles: [{ text: "Dynamic headline" }],
          link_urls: [{ website_url: "https://example.com/dynamic" }],
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockAdDetails,
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.meta.getAdDetails({
      accessToken: "test-token",
      adId: "ad_456",
    });

    expect(result.primaryText).toBe("Dynamic body text");
    expect(result.headline).toBe("Dynamic headline");
    expect(result.url).toBe("https://example.com/dynamic");
  });
});

describe("meta.createFullAd", () => {
  it("should create a full ad with all steps", async () => {
    // Mock template ad details
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        adset_id: "original_adset_123",
        account_id: "123456789",
        creative: {
          object_story_spec: {
            page_id: "page_123",
          },
        },
      }),
    });

    // Mock original ad set details
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        campaign_id: "campaign_123",
        targeting: { geo_locations: { countries: ["US"] } },
        billing_event: "IMPRESSIONS",
        optimization_goal: "LINK_CLICKS",
        daily_budget: "5000",
      }),
    });

    // Mock create ad set
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "new_adset_123" }),
    });

    // Mock upload image
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        images: {
          "test_image.jpg": {
            hash: "abc123hash",
            url: "https://example.com/image.jpg",
          },
        },
      }),
    });

    // Mock create creative
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "new_creative_123" }),
    });

    // Mock create ad
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "new_ad_123" }),
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.meta.createFullAd({
      accessToken: "test-token",
      templateAdId: "template_ad_123",
      newAdSetName: "New Ad Set",
      adName: "New Ad",
      primaryText: "Check this out!",
      headline: "Amazing Deal",
      url: "https://example.com",
      images: [
        {
          filename: "test_9x16.jpg",
          aspectRatio: "9x16",
          base64: "base64encodedimage",
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.adSetId).toBe("new_adset_123");
    expect(result.creativeId).toBe("new_creative_123");
    expect(result.adId).toBe("new_ad_123");
  });

  it("should throw error when page ID cannot be determined", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        adset_id: "original_adset_123",
        account_id: "123456789",
        creative: {
          object_story_spec: {},
        },
      }),
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.meta.createFullAd({
        accessToken: "test-token",
        templateAdId: "template_ad_123",
        newAdSetName: "New Ad Set",
        adName: "New Ad",
        primaryText: "Text",
        headline: "Headline",
        url: "https://example.com",
        images: [],
      })
    ).rejects.toThrow("Could not determine page ID from template ad");
  });
});
