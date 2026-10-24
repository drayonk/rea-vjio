import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { NextFunction, Request, Response } from "express";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "base64");
  const actual = await scryptAsync(password, Buffer.from(salt, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function issueToken(userId: string, secret: string): string {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyToken(token: string, secret: string): string | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const { sub, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof sub !== "string" || typeof exp !== "number") return null;
    return exp > Date.now() / 1000 ? sub : null;
  } catch {
    return null;
  }
}

declare module "express-serve-static-core" {
  interface Request {
    userId?: string;
  }
}

/** Tokens are stateless, so `userExists` rejects tokens of deleted accounts. */
export function requireAuth(secret: string, userExists: (userId: string) => boolean) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.header("authorization") ?? "";
    const userId = header.startsWith("Bearer ") ? verifyToken(header.slice(7), secret) : null;
    if (!userId || !userExists(userId)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    req.userId = userId;
    next();
  };
}

/** Returns the authenticated user id; only valid behind requireAuth. */
export function userIdOf(req: Request): string {
  if (!req.userId) throw new Error("requireAuth middleware missing");
  return req.userId;
}
