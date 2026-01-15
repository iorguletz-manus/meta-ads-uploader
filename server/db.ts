import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Facebook token management
export async function saveFacebookToken(openId: string, accessToken: string, expiresIn: number): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot save Facebook token: database not available");
    return;
  }

  try {
    // Calculate expiry date (expiresIn is in seconds)
    const expiryDate = new Date(Date.now() + expiresIn * 1000);
    
    await db.update(users)
      .set({
        facebookAccessToken: accessToken,
        facebookTokenExpiry: expiryDate,
      })
      .where(eq(users.openId, openId));
  } catch (error) {
    console.error("[Database] Failed to save Facebook token:", error);
    throw error;
  }
}

export async function getFacebookToken(openId: string): Promise<{ accessToken: string; expiry: Date } | null> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get Facebook token: database not available");
    return null;
  }

  try {
    const result = await db.select({
      accessToken: users.facebookAccessToken,
      expiry: users.facebookTokenExpiry,
    }).from(users).where(eq(users.openId, openId)).limit(1);

    if (result.length === 0 || !result[0].accessToken || !result[0].expiry) {
      return null;
    }

    // Check if token is expired
    if (new Date() > result[0].expiry) {
      return null;
    }

    return {
      accessToken: result[0].accessToken,
      expiry: result[0].expiry,
    };
  } catch (error) {
    console.error("[Database] Failed to get Facebook token:", error);
    return null;
  }
}

export async function clearFacebookToken(openId: string): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot clear Facebook token: database not available");
    return;
  }

  try {
    await db.update(users)
      .set({
        facebookAccessToken: null,
        facebookTokenExpiry: null,
      })
      .where(eq(users.openId, openId));
  } catch (error) {
    console.error("[Database] Failed to clear Facebook token:", error);
    throw error;
  }
}
