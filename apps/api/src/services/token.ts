import jwt from "jsonwebtoken";
import crypto from "crypto";
import { createHash } from "crypto";

export interface TokenPayload {
  userId: string;
  role: string;
  status: string;
}

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: "15m" });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;
}

/** Generates a cryptographically random URL-safe token string */
export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** Returns SHA-256 hash of the token for safe DB storage */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function refreshTokenExpiry(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 7); // 7 days
  return d;
}

export function passwordResetExpiry(): Date {
  const d = new Date();
  d.setHours(d.getHours() + 1); // 1 hour
  return d;
}

export function verificationExpiry(): Date {
  const d = new Date();
  d.setHours(d.getHours() + 24); // 24 hours
  return d;
}
