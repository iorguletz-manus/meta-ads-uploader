import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock fetch for Google Drive API calls
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

describe("google.downloadPublicFiles", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("should extract file ID from standard Google Drive URL format", async () => {
    // Mock metadata call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: "test_video.mp4",
        mimeType: "video/mp4",
        size: "1024000",
      }),
    });

    // Mock download call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(100),
    });

    // Mock Bunny upload
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.google.downloadPublicFiles({
      links: ["https://drive.google.com/file/d/1ABC123def456/view?usp=sharing"],
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].fileName).toBe("test_video.mp4");
    expect(result.results[0].fileType).toBe("video");
    expect(result.results[0].success).toBe(true);
  });

  it("should handle invalid Google Drive URLs", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.google.downloadPublicFiles({
      links: ["https://invalid-url.com/not-a-drive-link"],
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toContain("Invalid Google Drive URL");
  });

  it("should correctly identify video vs image files", async () => {
    // First file - video
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: "video.mp4",
        mimeType: "video/mp4",
        size: "1024000",
      }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(100),
    });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    // Second file - image
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: "image.jpg",
        mimeType: "image/jpeg",
        size: "512000",
      }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(50),
    });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.google.downloadPublicFiles({
      links: [
        "https://drive.google.com/file/d/VIDEO_ID/view",
        "https://drive.google.com/file/d/IMAGE_ID/view",
      ],
    });

    expect(result.results).toHaveLength(2);
    expect(result.results[0].fileType).toBe("video");
    expect(result.results[1].fileType).toBe("image");
  });

  it("should handle Google Drive API errors gracefully", async () => {
    // Mock metadata call with error
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        error: {
          code: 404,
          message: "File not found",
        },
      }),
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.google.downloadPublicFiles({
      links: ["https://drive.google.com/file/d/NONEXISTENT_ID/view"],
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toContain("File not found");
  });

  it("should process multiple links and return results for each", async () => {
    // Setup 3 files
    for (let i = 0; i < 3; i++) {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: `file${i + 1}.mp4`,
          mimeType: "video/mp4",
          size: "1024000",
        }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      });
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    }

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.google.downloadPublicFiles({
      links: [
        "https://drive.google.com/file/d/FILE1/view",
        "https://drive.google.com/file/d/FILE2/view",
        "https://drive.google.com/file/d/FILE3/view",
      ],
    });

    expect(result.results).toHaveLength(3);
    expect(result.results.filter((r: any) => r.success)).toHaveLength(3);
  });

  it("should extract file ID from open?id= URL format", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: "test.mp4",
        mimeType: "video/mp4",
        size: "1024",
      }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(100),
    });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.google.downloadPublicFiles({
      links: ["https://drive.google.com/open?id=ABC123XYZ"],
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(true);
  });
});
