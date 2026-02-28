import { Router, Request, Response, NextFunction } from "express";
import argon2 from "argon2";
import { z } from "zod";
import { getDb, users, refreshTokens } from "@monitor/db";
import { eq } from "drizzle-orm";
import { authJwt, requireApproved } from "../middleware/authJwt";
import { createError } from "../middleware/errorHandler";
import { hashToken } from "../services/token";

export const meRouter = Router();
meRouter.use(authJwt);
meRouter.use(requireApproved);

// ── GET /api/me ───────────────────────────────────────────────────────────────
meRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const [user] = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        role: users.role,
        status: users.status,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, req.user!.userId))
      .limit(1);

    if (!user) return next(createError(404, "User not found"));
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/me ───────────────────────────────────────────────────────────────
meRouter.put("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { fullName } = z.object({ fullName: z.string().min(1).max(100) }).parse(req.body);
    const db = getDb();
    await db
      .update(users)
      .set({ fullName, updatedAt: new Date() })
      .where(eq(users.id, req.user!.userId));
    res.json({ message: "Profile updated" });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/me/password ──────────────────────────────────────────────────────
meRouter.put("/password", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = z
      .object({
        currentPassword: z.string().min(1),
        newPassword: z
          .string()
          .min(10)
          .regex(/[a-zA-Z]/)
          .regex(/[0-9]/),
      })
      .parse(req.body);

    const db = getDb();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.user!.userId))
      .limit(1);

    if (!user) return next(createError(404, "User not found"));

    const valid = await argon2.verify(user.passwordHash, currentPassword);
    if (!valid) return next(createError(400, "Current password is incorrect"));

    const passwordHash = await argon2.hash(newPassword);
    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    // Invalidate all refresh tokens (force re-login on other devices)
    const rawToken = req.cookies?.refresh_token as string | undefined;
    if (rawToken) {
      // Keep current session, invalidate others
      const currentHash = hashToken(rawToken);
      await db
        .delete(refreshTokens)
        .where(eq(refreshTokens.userId, user.id));
      // Note: user will need to re-login; this is intentional for security
    }

    res.json({ message: "Password updated. Please log in again." });
  } catch (err) {
    next(err);
  }
});
