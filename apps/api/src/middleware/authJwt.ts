import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { createError } from "./errorHandler";

export interface JwtPayload {
  userId: string;
  role: string;
  status: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authJwt(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(createError(401, "Authentication required"));
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    next(createError(401, "Invalid or expired token"));
  }
}

export function requireApproved(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(createError(401, "Authentication required"));
  if (req.user.status !== "approved" && req.user.role !== "admin") {
    return next(createError(403, "Account not approved"));
  }
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(createError(401, "Authentication required"));
  if (req.user.role !== "admin") {
    return next(createError(403, "Admin access required"));
  }
  next();
}
