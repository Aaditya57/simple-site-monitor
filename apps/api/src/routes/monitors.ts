import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { getDb, monitors, monitorChecks } from "@monitor/db";
import { eq, and, isNull, desc, sql } from "drizzle-orm";
import { authJwt, requireApproved } from "../middleware/authJwt";
import { createError } from "../middleware/errorHandler";
import { validateMonitorUrl, SsrfError } from "../services/ssrf";

export const monitorsRouter = Router();
monitorsRouter.use(authJwt);
monitorsRouter.use(requireApproved);

const MAX_MONITORS = () =>
  Number(process.env.MAX_MONITORS_PER_USER ?? 50);

const monitorInputSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().url().max(2048),
  intervalMinutes: z.enum(["1", "5", "10", "15", "30"]).transform(Number).or(z.number().refine((n) => [1, 5, 10, 15, 30].includes(n))),
  timeoutSeconds: z.number().int().min(5).max(30).optional().default(10),
  expectedStatus: z.string().optional().default("2xx_3xx"),
  keyword: z.string().max(500).optional(),
  keywordCaseInsensitive: z.boolean().optional().default(false),
  tlsCheckEnabled: z.boolean().optional().default(true),
  tlsWarnDays: z.number().int().min(1).max(60).optional().default(10),
  dnsCheckEnabled: z.boolean().optional().default(false),
  additionalEmails: z.array(z.string().email()).max(10).optional().default([]),
});

// ── POST /api/monitors ────────────────────────────────────────────────────────
monitorsRouter.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = monitorInputSchema.safeParse(req.body);
    if (!body.success) return next(createError(400, body.error.issues[0]?.message ?? "Invalid input"));

    const db = getDb();
    const userId = req.user!.userId;

    // Check monitor count limit
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(monitors)
      .where(and(eq(monitors.userId, userId), isNull(monitors.deletedAt)));

    if (count >= MAX_MONITORS()) {
      return next(
        Object.assign(createError(422, `Monitor limit reached (max ${MAX_MONITORS()})`), {
          code: "MONITOR_LIMIT_REACHED",
          limit: MAX_MONITORS(),
        })
      );
    }

    // Validate URL for SSRF
    try {
      await validateMonitorUrl(body.data.url);
    } catch (e) {
      if (e instanceof SsrfError) return next(createError(400, e.message));
      throw e;
    }

    const [monitor] = await db
      .insert(monitors)
      .values({
        userId,
        ...body.data,
        nextCheckAt: new Date(),
      })
      .returning();

    res.status(201).json(monitor);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/monitors ─────────────────────────────────────────────────────────
monitorsRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(monitors)
      .where(and(eq(monitors.userId, req.user!.userId), isNull(monitors.deletedAt)))
      .orderBy(monitors.createdAt);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/monitors/:id ─────────────────────────────────────────────────────
monitorsRouter.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const monitor = await getOwnedMonitor(req.params.id as string, req.user!.userId);
    if (!monitor) return next(createError(404, "Monitor not found"));
    res.json(monitor);
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/monitors/:id ─────────────────────────────────────────────────────
monitorsRouter.put("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const monitor = await getOwnedMonitor(req.params.id as string, req.user!.userId);
    if (!monitor) return next(createError(404, "Monitor not found"));

    const body = monitorInputSchema.partial().safeParse(req.body);
    if (!body.success) return next(createError(400, body.error.issues[0]?.message ?? "Invalid input"));

    if (body.data.url) {
      try {
        await validateMonitorUrl(body.data.url);
      } catch (e) {
        if (e instanceof SsrfError) return next(createError(400, e.message));
        throw e;
      }
    }

    const db = getDb();
    const [updated] = await db
      .update(monitors)
      .set({ ...body.data, updatedAt: new Date() })
      .where(eq(monitors.id, monitor.id))
      .returning();

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/monitors/:id ──────────────────────────────────────────────────
monitorsRouter.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const monitor = await getOwnedMonitor(req.params.id as string, req.user!.userId);
    if (!monitor) return next(createError(404, "Monitor not found"));

    const db = getDb();
    await db.delete(monitors).where(eq(monitors.id, monitor.id));
    res.json({ message: "Monitor deleted" });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/monitors/:id/pause ──────────────────────────────────────────────
monitorsRouter.post("/:id/pause", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const monitor = await getOwnedMonitor(req.params.id as string, req.user!.userId);
    if (!monitor) return next(createError(404, "Monitor not found"));

    const db = getDb();
    await db
      .update(monitors)
      .set({ isPaused: true, updatedAt: new Date() })
      .where(eq(monitors.id, monitor.id));
    res.json({ message: "Monitor paused" });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/monitors/:id/resume ─────────────────────────────────────────────
monitorsRouter.post("/:id/resume", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const monitor = await getOwnedMonitor(req.params.id as string, req.user!.userId);
    if (!monitor) return next(createError(404, "Monitor not found"));

    const db = getDb();
    await db
      .update(monitors)
      .set({ isPaused: false, nextCheckAt: new Date(), updatedAt: new Date() })
      .where(eq(monitors.id, monitor.id));
    res.json({ message: "Monitor resumed" });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/monitors/:id/checks ──────────────────────────────────────────────
monitorsRouter.get("/:id/checks", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const monitor = await getOwnedMonitor(req.params.id as string, req.user!.userId);
    if (!monitor) return next(createError(404, "Monitor not found"));

    const limit = Math.min(Number(req.query["limit"] ?? 100), 100);
    const db = getDb();
    const checks = await db
      .select()
      .from(monitorChecks)
      .where(eq(monitorChecks.monitorId, monitor.id))
      .orderBy(desc(monitorChecks.checkedAt))
      .limit(limit);

    res.json(checks);
  } catch (err) {
    next(err);
  }
});

// ── Helper ────────────────────────────────────────────────────────────────────
async function getOwnedMonitor(id: string, userId: string) {
  const db = getDb();
  const [monitor] = await db
    .select()
    .from(monitors)
    .where(
      and(eq(monitors.id, id), eq(monitors.userId, userId), isNull(monitors.deletedAt))
    )
    .limit(1);
  return monitor ?? null;
}
