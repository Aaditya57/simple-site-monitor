import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  getDb,
  users,
  monitors,
  monitorChecks,
  adminAuditLog,
  refreshTokens,
  workerStatus,
} from "@monitor/db";
import { eq, isNull, sql, desc } from "drizzle-orm";
import { authJwt, requireAdmin } from "../middleware/authJwt";
import { createError } from "../middleware/errorHandler";
import { sendApprovalEmail, sendRejectionEmail } from "../services/email";

export const adminRouter = Router();
adminRouter.use(authJwt);
adminRouter.use(requireAdmin);

function param(req: Request, key: string): string {
  const v = req.params[key];
  return Array.isArray(v) ? v[0]! : (v ?? "");
}

// ── GET /api/admin/users ──────────────────────────────────────────────────────
adminRouter.get("/users", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = req.query["status"] as string | undefined;
    const db = getDb();

    const rows = status
      ? await db
          .select({
            id: users.id,
            fullName: users.fullName,
            email: users.email,
            role: users.role,
            status: users.status,
            emailVerified: users.emailVerified,
            approvedAt: users.approvedAt,
            createdAt: users.createdAt,
          })
          .from(users)
          .where(eq(users.status, status))
          .orderBy(desc(users.createdAt))
      : await db
          .select({
            id: users.id,
            fullName: users.fullName,
            email: users.email,
            role: users.role,
            status: users.status,
            emailVerified: users.emailVerified,
            approvedAt: users.approvedAt,
            createdAt: users.createdAt,
          })
          .from(users)
          .orderBy(desc(users.createdAt));

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/admin/users/:id/approve ─────────────────────────────────────────
adminRouter.post(
  "/users/:id/approve",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const targetId = param(req, "id");
      const db = getDb();
      const [target] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
      if (!target) return next(createError(404, "User not found"));

      await db
        .update(users)
        .set({
          status: "approved",
          approvedAt: new Date(),
          approvedBy: req.user!.userId,
          updatedAt: new Date(),
        })
        .where(eq(users.id, targetId));

      await db.insert(adminAuditLog).values({
        adminId: req.user!.userId,
        targetUserId: targetId,
        action: "approve",
      });

      await sendApprovalEmail(target.email);
      res.json({ message: "User approved" });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/admin/users/:id/reject ──────────────────────────────────────────
adminRouter.post(
  "/users/:id/reject",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const targetId = param(req, "id");
      const { reason } = z.object({ reason: z.string().max(500).optional() }).parse(req.body);
      const db = getDb();
      const [target] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
      if (!target) return next(createError(404, "User not found"));

      await db
        .update(users)
        .set({ status: "rejected", rejectionReason: reason ?? null, updatedAt: new Date() })
        .where(eq(users.id, targetId));

      await db.insert(adminAuditLog).values({
        adminId: req.user!.userId,
        targetUserId: targetId,
        action: "reject",
        reason: reason ?? null,
      });

      await sendRejectionEmail(target.email, reason);
      res.json({ message: "User rejected" });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/admin/users/:id/suspend ─────────────────────────────────────────
adminRouter.post(
  "/users/:id/suspend",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const targetId = param(req, "id");
      const { reason } = z.object({ reason: z.string().max(500).optional() }).parse(req.body);

      if (targetId === req.user!.userId) {
        return next(createError(400, "You cannot suspend yourself"));
      }

      const db = getDb();
      const [target] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
      if (!target) return next(createError(404, "User not found"));

      await db
        .update(users)
        .set({ status: "suspended", updatedAt: new Date() })
        .where(eq(users.id, targetId));

      await db.delete(refreshTokens).where(eq(refreshTokens.userId, targetId));

      await db.insert(adminAuditLog).values({
        adminId: req.user!.userId,
        targetUserId: targetId,
        action: "suspend",
        reason: reason ?? null,
      });

      res.json({ message: "User suspended" });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/admin/monitors ───────────────────────────────────────────────────
adminRouter.get("/monitors", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const rows = await db
      .select({
        id: monitors.id,
        userId: monitors.userId,
        name: monitors.name,
        url: monitors.url,
        currentStatus: monitors.currentStatus,
        isPaused: monitors.isPaused,
        lastCheckedAt: monitors.lastCheckedAt,
        intervalMinutes: monitors.intervalMinutes,
        createdAt: monitors.createdAt,
      })
      .from(monitors)
      .where(isNull(monitors.deletedAt))
      .orderBy(desc(monitors.createdAt));

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/health ─────────────────────────────────────────────────────
adminRouter.get("/health", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();

    const totalMonitorsResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(monitors)
      .where(isNull(monitors.deletedAt));

    const totalChecksTodayResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(monitorChecks)
      .where(sql`checked_at >= NOW() - INTERVAL '24 hours'`);

    const wsRows = await db
      .select({ lastHeartbeatAt: workerStatus.lastHeartbeatAt })
      .from(workerStatus)
      .orderBy(desc(workerStatus.lastHeartbeatAt))
      .limit(1);

    const ws = wsRows[0];
    const workerAlive = ws
      ? new Date().getTime() - new Date(ws.lastHeartbeatAt).getTime() < 90_000
      : false;

    res.json({
      worker: {
        alive: workerAlive,
        lastHeartbeatAt: ws?.lastHeartbeatAt ?? null,
      },
      monitors: { total: totalMonitorsResult[0]?.count ?? 0 },
      checks: { last24h: totalChecksTodayResult[0]?.count ?? 0 },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/audit-log ──────────────────────────────────────────────────
adminRouter.get("/audit-log", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(Number(req.query["limit"] ?? 50), 200);
    const offset = Number(req.query["offset"] ?? 0);
    const db = getDb();

    const rows = await db
      .select()
      .from(adminAuditLog)
      .orderBy(desc(adminAuditLog.createdAt))
      .limit(limit)
      .offset(offset);

    res.json(rows);
  } catch (err) {
    next(err);
  }
});
