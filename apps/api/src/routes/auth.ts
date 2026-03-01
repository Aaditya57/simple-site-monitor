import { Router, Request, Response, NextFunction } from "express";
import argon2 from "argon2";
import { z } from "zod";
import { getDb, users, refreshTokens } from "@monitor/db";
import { eq, and, gt } from "drizzle-orm";
import {
  signAccessToken,
  generateSecureToken,
  hashToken,
  refreshTokenExpiry,
  passwordResetExpiry,
  verificationExpiry,
} from "../services/token";
import {
  sendVerificationEmail,
  sendAdminNewUserNotification,
  sendPasswordResetEmail,
} from "../services/email";
import { verifyCaptcha } from "../services/captcha";
import { createError } from "../middleware/errorHandler";
import {
  signupLimit,
  loginLimit,
  forgotPasswordLimit,
  resendVerificationLimit,
} from "../middleware/rateLimits";

export const authRouter = Router();

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/api/auth/refresh",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days ms
};

// ── POST /api/auth/signup ─────────────────────────────────────────────────────
const signupSchema = z.object({
  fullName: z.string().min(1).max(100),
  email: z.string().email().max(255),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .regex(/[a-zA-Z]/, "Password must contain at least one letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  captchaToken: z.string().min(1),
});

authRouter.post(
  "/signup",
  signupLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = signupSchema.safeParse(req.body);
      if (!body.success) {
        return next(createError(400, body.error.issues[0]?.message ?? "Invalid input"));
      }
      const { fullName, email, password, captchaToken } = body.data;

      const captchaOk = await verifyCaptcha(captchaToken);
      if (!captchaOk) return next(createError(400, "Captcha verification failed"));

      const db = getDb();
      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);

      if (existing.length > 0) {
        return next(createError(409, "An account with this email already exists"));
      }

      const passwordHash = await argon2.hash(password);
      const verificationToken = generateSecureToken();
      const verificationTokenHash = hashToken(verificationToken);

      await db.insert(users).values({
        fullName,
        email: email.toLowerCase(),
        passwordHash,
        status: "unverified",
        emailVerified: false,
        emailVerificationToken: verificationTokenHash,
        emailVerificationExpires: verificationExpiry(),
      });

      sendVerificationEmail(email, verificationToken).catch((e) =>
        console.error("[auth] verification email failed:", e.message)
      );

      res.status(201).json({
        message: "Account created. Check your email to verify your address.",
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/auth/verify-email ────────────────────────────────────────────────
authRouter.get(
  "/verify-email",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = req.query["token"] as string | undefined;
      if (!token) return next(createError(400, "Missing token"));

      const tokenHash = hashToken(token);
      const db = getDb();
      const [user] = await db
        .select()
        .from(users)
        .where(
          and(
            eq(users.emailVerificationToken, tokenHash),
            gt(users.emailVerificationExpires, new Date())
          )
        )
        .limit(1);

      if (!user) return next(createError(400, "Invalid or expired verification link"));
      if (user.emailVerified) {
        return res.json({ message: "Email already verified" });
      }

      await db
        .update(users)
        .set({
          emailVerified: true,
          status: "pending",
          emailVerificationToken: null,
          emailVerificationExpires: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      // Notify all admins
      const admins = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.role, "admin"));
      await Promise.all(
        admins.map((a) => sendAdminNewUserNotification(a.email, user.email))
      );

      res.json({ message: "Email verified. Your account is pending admin approval." });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/auth/resend-verification ────────────────────────────────────────
authRouter.post(
  "/resend-verification",
  resendVerificationLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = z.object({ email: z.string().email() }).parse(req.body);
      const db = getDb();
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);

      if (!user || user.emailVerified) {
        // Don't reveal whether account exists
        return res.json({ message: "If your account exists and is unverified, a new email has been sent." });
      }

      const verificationToken = generateSecureToken();
      await db
        .update(users)
        .set({
          emailVerificationToken: hashToken(verificationToken),
          emailVerificationExpires: verificationExpiry(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      sendVerificationEmail(user.email, verificationToken).catch((e) =>
        console.error("[auth] resend verification email failed:", e.message)
      );
      res.json({ message: "If your account exists and is unverified, a new email has been sent." });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/auth/login ──────────────────────────────────────────────────────
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  captchaToken: z.string().optional(),
});

authRouter.post(
  "/login",
  loginLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = loginSchema.safeParse(req.body);
      if (!body.success) return next(createError(400, "Invalid input"));
      const { email, password, captchaToken } = body.data;

      if (captchaToken) {
        const ok = await verifyCaptcha(captchaToken);
        if (!ok) return next(createError(400, "Captcha verification failed"));
      }

      const db = getDb();
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);

      // Use constant-time comparison to prevent timing attacks
      const dummyHash = "$argon2id$v=19$m=65536,t=3,p=4$dummydummydummy$dummydummydummydummydummydummydummydummy";
      const passwordValid = user
        ? await argon2.verify(user.passwordHash, password)
        : await argon2.verify(dummyHash, password).catch(() => false);

      if (!user || !passwordValid) {
        return next(createError(401, "Invalid email or password"));
      }

      if (!user.emailVerified) {
        return next(createError(403, "Please verify your email first"));
      }

      if (user.status === "pending") {
        return next(
          Object.assign(createError(403, "Your account is pending admin approval"), {
            code: "ACCOUNT_PENDING",
          })
        );
      }
      if (user.status === "rejected") {
        return next(
          Object.assign(createError(403, "Your account application was not approved"), {
            code: "ACCOUNT_REJECTED",
          })
        );
      }
      if (user.status === "suspended") {
        return next(
          Object.assign(createError(403, "Your account has been suspended"), {
            code: "ACCOUNT_SUSPENDED",
          })
        );
      }
      if (user.status !== "approved" && user.role !== "admin") {
        return next(createError(403, "Account not active"));
      }

      // Issue tokens
      const accessToken = signAccessToken({
        userId: user.id,
        role: user.role,
        status: user.status,
      });
      const rawRefresh = generateSecureToken();
      await db.insert(refreshTokens).values({
        userId: user.id,
        tokenHash: hashToken(rawRefresh),
        expiresAt: refreshTokenExpiry(),
      });

      res.cookie("refresh_token", rawRefresh, COOKIE_OPTS);
      res.json({
        accessToken,
        user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role, status: user.status },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/auth/refresh ────────────────────────────────────────────────────
authRouter.post(
  "/refresh",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawToken = req.cookies?.refresh_token as string | undefined;
      if (!rawToken) return next(createError(401, "No refresh token"));

      const db = getDb();
      const tokenHash = hashToken(rawToken);
      const [rt] = await db
        .select()
        .from(refreshTokens)
        .where(
          and(
            eq(refreshTokens.tokenHash, tokenHash),
            gt(refreshTokens.expiresAt, new Date())
          )
        )
        .limit(1);

      if (!rt) return next(createError(401, "Invalid or expired refresh token"));

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, rt.userId))
        .limit(1);

      if (!user) return next(createError(401, "User not found"));

      // Check status hasn't changed (e.g., suspended)
      if (user.status === "suspended") {
        await db.delete(refreshTokens).where(eq(refreshTokens.userId, user.id));
        res.clearCookie("refresh_token");
        return next(
          Object.assign(createError(403, "Account suspended"), { code: "ACCOUNT_SUSPENDED" })
        );
      }

      // Rotate refresh token
      const newRaw = generateSecureToken();
      await db.delete(refreshTokens).where(eq(refreshTokens.id, rt.id));
      await db.insert(refreshTokens).values({
        userId: user.id,
        tokenHash: hashToken(newRaw),
        expiresAt: refreshTokenExpiry(),
      });

      const accessToken = signAccessToken({
        userId: user.id,
        role: user.role,
        status: user.status,
      });

      res.cookie("refresh_token", newRaw, COOKIE_OPTS);
      res.json({
        accessToken,
        user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role, status: user.status },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
authRouter.post(
  "/logout",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawToken = req.cookies?.refresh_token as string | undefined;
      if (rawToken) {
        const db = getDb();
        await db
          .delete(refreshTokens)
          .where(eq(refreshTokens.tokenHash, hashToken(rawToken)));
      }
      res.clearCookie("refresh_token");
      res.json({ message: "Logged out" });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/auth/forgot-password ────────────────────────────────────────────
authRouter.post(
  "/forgot-password",
  forgotPasswordLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = z.object({ email: z.string().email() }).parse(req.body);
      const db = getDb();
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);

      // Always return 200 to prevent email enumeration
      if (user && user.emailVerified) {
        const token = generateSecureToken();
        await db
          .update(users)
          .set({
            passwordResetToken: hashToken(token),
            passwordResetExpires: passwordResetExpiry(),
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id));
        sendPasswordResetEmail(user.email, token).catch((e) =>
          console.error("[auth] password reset email failed:", e.message)
        );
      }

      res.json({ message: "If an account with that email exists, a reset link has been sent." });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/auth/reset-password ─────────────────────────────────────────────
authRouter.post(
  "/reset-password",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token, newPassword } = z
        .object({
          token: z.string().min(1),
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
        .where(
          and(
            eq(users.passwordResetToken, hashToken(token)),
            gt(users.passwordResetExpires, new Date())
          )
        )
        .limit(1);

      if (!user) return next(createError(400, "Invalid or expired reset link"));

      const passwordHash = await argon2.hash(newPassword);
      await db
        .update(users)
        .set({
          passwordHash,
          passwordResetToken: null,
          passwordResetExpires: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      // Invalidate all existing sessions
      await db.delete(refreshTokens).where(eq(refreshTokens.userId, user.id));

      res.json({ message: "Password reset successfully. Please log in again." });
    } catch (err) {
      next(err);
    }
  }
);
