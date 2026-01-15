import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { COOKIE_NAME } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import { jwtVerify } from "jose";
import { ENV } from "./env";
import { getUserByOpenId, upsertUser } from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

// Fixed user openId for simple login
const FIXED_USER_OPEN_ID = "fixed-user-id";
const FIXED_USER_NAME = "iorguletz";

async function verifySimpleSession(cookieValue: string | undefined): Promise<User | null> {
  if (!cookieValue) return null;
  
  try {
    const secret = new TextEncoder().encode(ENV.cookieSecret);
    const { payload } = await jwtVerify(cookieValue, secret, {
      algorithms: ["HS256"],
    });
    
    // Check if it's our fixed user iorguletz
    if (payload.openId === FIXED_USER_OPEN_ID && payload.name === FIXED_USER_NAME) {
      // Try to get user from database
      let dbUser = await getUserByOpenId(FIXED_USER_OPEN_ID);
      
      if (!dbUser) {
        // Create user in database if not exists
        await upsertUser({
          openId: FIXED_USER_OPEN_ID,
          name: FIXED_USER_NAME,
          loginMethod: "password",
          role: "admin",
        });
        dbUser = await getUserByOpenId(FIXED_USER_OPEN_ID);
      }
      
      if (dbUser) {
        return dbUser;
      }
      
      // Fallback to static user if database fails
      return {
        id: 1,
        openId: FIXED_USER_OPEN_ID,
        name: FIXED_USER_NAME,
        email: null,
        loginMethod: "password",
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
        facebookAccessToken: null,
        facebookTokenExpiry: null,
        selectedAdAccountId: null,
        enabledAdAccountIds: null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    // Only use simple login verification for iorguletz
    const cookies = parseCookieHeader(opts.req.headers.cookie || "");
    const sessionCookie = cookies[COOKIE_NAME];
    
    user = await verifySimpleSession(sessionCookie);
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
