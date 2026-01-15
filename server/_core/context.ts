import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { COOKIE_NAME } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import { jwtVerify } from "jose";
import { ENV } from "./env";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

// Fixed user for simple login
const FIXED_USER: User = {
  id: 1,
  openId: "fixed-user-id",
  name: "iorguletz",
  email: null,
  loginMethod: "password",
  role: "admin",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
  facebookAccessToken: null,
  facebookTokenExpiry: null,
};

async function verifySimpleSession(cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue) return false;
  
  try {
    const secret = new TextEncoder().encode(ENV.cookieSecret);
    const { payload } = await jwtVerify(cookieValue, secret, {
      algorithms: ["HS256"],
    });
    
    // Check if it's our fixed user
    return payload.openId === "fixed-user-id" && payload.name === "iorguletz";
  } catch {
    return false;
  }
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    // First try simple login verification
    const cookies = parseCookieHeader(opts.req.headers.cookie || "");
    const sessionCookie = cookies[COOKIE_NAME];
    
    if (await verifySimpleSession(sessionCookie)) {
      user = FIXED_USER;
    } else {
      // Fall back to SDK authentication
      user = await sdk.authenticateRequest(opts.req);
    }
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
