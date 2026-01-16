import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";

// Mock fetch for Google Drive API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

// vi.mock is hoisted, so we need to use vi.hoisted to create mocks that can be referenced
const { mockBunnyStreamFetchVideo, mockBunnyStreamWaitForVideo, mockIsBunnyStreamConfigured } = vi.hoisted(() => ({
  mockBunnyStreamFetchVideo: vi.fn(),
  mockBunnyStreamWaitForVideo: vi.fn(),
  mockIsBunnyStreamConfigured: vi.fn(),
}));

// Mock bunnyStorage module
vi.mock("./bunnyStorage", () => ({
  uploadToBunny: vi.fn(),
  deleteFromBunny: vi.fn(),
  uploadBufferToBunny: vi.fn(),
  bunnyStreamFetchVideo: mockBunnyStreamFetchVideo,
  bunnyStreamWaitForVideo: mockBunnyStreamWaitForVideo,
  isBunnyStreamConfigured: mockIsBunnyStreamConfigured,
}));

// Import routers AFTER mocking
import { appRouter } from "./routers";

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
    facebookAccessToken: null,
    facebookTokenExpiry: null,
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

describe("google.bunnyFetchFiles", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockBunnyStreamFetchVideo.mockReset();
    mockBunnyStreamWaitForVideo.mockReset();
    mockIsBunnyStreamConfigured.mockReset();
    
    // Default: Bunny Stream is configured
    mockIsBunnyStreamConfigured.mockReturnValue(true);
  });

  it("should extract file ID and call Bunny Stream fetch", async () => {
    // Mock Google Drive metadata call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: "test_video.mp4",
        mimeType: "video/mp4",
      }),
    });

    // Mock Bunny Stream fetch
    mockBunnyStreamFetchVideo.mockResolvedValueOnce({
      success: true,
      videoId: "12345",
      videoGuid: "abc-123-def",
      title: "test_video.mp4",
      status: 1,
    });

    // Mock Bunny Stream wait (for waitForProcessing)
    mockBunnyStreamWaitForVideo.mockResolvedValueOnce({
      guid: "abc-123-def",
      title: "test_video.mp4",
      status: 4,
      directPlayUrl: "https://test.b-cdn.net/abc-123-def/play.mp4",
      thumbnailUrl: "https://test.b-cdn.net/abc-123-def/thumbnail.jpg",
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.google.bunnyFetchFiles({
      links: ["https://drive.google.com/file/d/1ABC123def456/view?usp=sharing"],
      waitForProcessing: true,
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].fileName).toBe("test_video.mp4");
    expect(result.results[0].videoGuid).toBe("abc-123-def");
    expect(result.results[0].success).toBe(true);
    expect(result.results[0].status).toBe("finished");
    
    // Verify Bunny was called with correct download URL
    expect(mockBunnyStreamFetchVideo).toHaveBeenCalledWith(
      "https://drive.google.com/uc?export=download&id=1ABC123def456",
      "test_video.mp4"
    );
  });

  it("should handle invalid Google Drive URLs", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.google.bunnyFetchFiles({
      links: ["https://invalid-url.com/not-a-drive-link"],
      waitForProcessing: false,
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toContain("Invalid Google Drive URL");
  });

  it("should return processing status when waitForProcessing is false", async () => {
    // Mock Google Drive metadata call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: "video.mp4",
        mimeType: "video/mp4",
      }),
    });

    // Mock Bunny Stream fetch
    mockBunnyStreamFetchVideo.mockResolvedValueOnce({
      success: true,
      videoId: "12345",
      videoGuid: "video-guid",
      title: "video.mp4",
      status: 1,
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.google.bunnyFetchFiles({
      links: ["https://drive.google.com/file/d/VIDEO_ID/view"],
      waitForProcessing: false,
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(true);
    expect(result.results[0].status).toBe("processing");
    expect(result.results[0].videoGuid).toBe("video-guid");
    
    // Should NOT call waitForVideo when waitForProcessing is false
    expect(mockBunnyStreamWaitForVideo).not.toHaveBeenCalled();
  });

  it("should process multiple links", async () => {
    // Setup 2 files - metadata calls
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: "video1.mp4",
          mimeType: "video/mp4",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: "video2.mp4",
          mimeType: "video/mp4",
        }),
      });
    
    // Bunny fetch calls
    mockBunnyStreamFetchVideo
      .mockResolvedValueOnce({
        success: true,
        videoGuid: "guid-1",
        title: "video1.mp4",
        status: 1,
      })
      .mockResolvedValueOnce({
        success: true,
        videoGuid: "guid-2",
        title: "video2.mp4",
        status: 1,
      });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.google.bunnyFetchFiles({
      links: [
        "https://drive.google.com/file/d/FILE1/view",
        "https://drive.google.com/file/d/FILE2/view",
      ],
      waitForProcessing: false,
    });

    expect(result.results).toHaveLength(2);
    expect(result.results.filter((r: any) => r.success)).toHaveLength(2);
    expect(mockBunnyStreamFetchVideo).toHaveBeenCalledTimes(2);
  });

  it("should handle Bunny Stream API errors gracefully", async () => {
    // Mock Google Drive metadata call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: "video.mp4",
        mimeType: "video/mp4",
      }),
    });

    // Mock Bunny Stream fetch with error
    mockBunnyStreamFetchVideo.mockResolvedValueOnce({
      success: false,
      error: "Invalid URL provided",
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.google.bunnyFetchFiles({
      links: ["https://drive.google.com/file/d/BAD_FILE/view"],
      waitForProcessing: false,
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toContain("Invalid URL provided");
  });

  it("should extract file ID from open?id= URL format", async () => {
    // Mock Google Drive metadata call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: "video.mp4",
        mimeType: "video/mp4",
      }),
    });

    // Mock Bunny Stream fetch
    mockBunnyStreamFetchVideo.mockResolvedValueOnce({
      success: true,
      videoGuid: "video-guid",
      title: "video.mp4",
      status: 1,
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.google.bunnyFetchFiles({
      links: ["https://drive.google.com/open?id=ABC123XYZ"],
      waitForProcessing: false,
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(true);
    
    // Verify correct file ID was extracted
    expect(mockBunnyStreamFetchVideo).toHaveBeenCalledWith(
      "https://drive.google.com/uc?export=download&id=ABC123XYZ",
      "video.mp4"
    );
  });

  it("should throw error when Bunny Stream is not configured", async () => {
    mockIsBunnyStreamConfigured.mockReturnValue(false);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.google.bunnyFetchFiles({
        links: ["https://drive.google.com/file/d/FILE_ID/view"],
        waitForProcessing: false,
      })
    ).rejects.toThrow("Bunny Stream is not configured");
  });
});
