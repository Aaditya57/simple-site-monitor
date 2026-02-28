import dotenv from "dotenv";
dotenv.config();
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth";
import { monitorsRouter } from "./routes/monitors";
import { meRouter } from "./routes/me";
import { adminRouter } from "./routes/admin";
import { bootstrapAdmin } from "./services/bootstrap";
import { errorHandler } from "./middleware/errorHandler";

const app = express();
const PORT = process.env.PORT ?? 3000;

// ── Security headers ──────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
      },
    },
  })
);

// ── CORS ─────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.APP_URL ?? "http://localhost:5173",
    credentials: true,
  })
);

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/auth", authRouter);
app.use("/api/me", meRouter);
app.use("/api/monitors", monitorsRouter);
app.use("/api/admin", adminRouter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/api/ping", (_req, res) => res.json({ ok: true }));

// ── Error handler ─────────────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
bootstrapAdmin()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[api] listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("[api] startup error", err);
    process.exit(1);
  });
