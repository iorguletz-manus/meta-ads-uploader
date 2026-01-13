import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type CookieCall = {
  name: string;
  value: string;
  options: Record<string, unknown>;
};

function createPublicContext(): { ctx: TrpcContext; setCookies: CookieCall[] } {
  const setCookies: CookieCall[] = [];

  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string, options: Record<string, unknown>) => {
        setCookies.push({ name, value, options });
      },
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };

  return { ctx, setCookies };
}

describe("auth.login", () => {
  it("should login successfully with correct credentials", async () => {
    const { ctx, setCookies } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.login({
      username: "iorguletz",
      password: "cinema10",
    });

    expect(result.success).toBe(true);
    expect(result.user.name).toBe("iorguletz");
    expect(setCookies).toHaveLength(1);
    expect(setCookies[0]?.name).toBe("app_session_id");
    expect(setCookies[0]?.value).toBeTruthy(); // JWT token
  });

  it("should reject login with wrong username", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.login({
        username: "wronguser",
        password: "cinema10",
      })
    ).rejects.toThrow("Invalid username or password");
  });

  it("should reject login with wrong password", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.login({
        username: "iorguletz",
        password: "wrongpassword",
      })
    ).rejects.toThrow("Invalid username or password");
  });

  it("should reject login with empty credentials", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.login({
        username: "",
        password: "",
      })
    ).rejects.toThrow("Invalid username or password");
  });
});
