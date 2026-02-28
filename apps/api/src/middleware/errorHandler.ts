import { Request, Response, NextFunction } from "express";

export interface AppError extends Error {
  status?: number;
  code?: string;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const status = err.status ?? 500;
  const message = status < 500 ? err.message : "Internal server error";
  const code = err.code;

  if (status >= 500) {
    console.error("[api] unhandled error", err);
  }

  res.status(status).json({ error: message, ...(code ? { code } : {}) });
}

export function createError(status: number, message: string, code?: string): AppError {
  const err = new Error(message) as AppError;
  err.status = status;
  if (code) err.code = code;
  return err;
}
