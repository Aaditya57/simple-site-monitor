import rateLimit from "express-rate-limit";

const make = (max: number, windowMs: number, message: string) =>
  rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
  });

export const signupLimit = make(10, 60 * 60 * 1000, "Too many signup attempts, try again later");
export const loginLimit = make(20, 60 * 60 * 1000, "Too many login attempts, try again later");
export const forgotPasswordLimit = make(5, 15 * 60 * 1000, "Too many requests, try again in 15 minutes");
export const resendVerificationLimit = make(3, 60 * 60 * 1000, "Too many resend requests, try again later");
export const apiLimit = make(300, 60 * 1000, "Too many requests");
