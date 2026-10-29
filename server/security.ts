// Security middleware: response headers, the role switcher's identity, and a small rate limit for AI routes.
import type { NextFunction, Request, Response } from "express";
import { users, type Role, type User } from "./config.js";
import { ApiError } from "./envelope.js";

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'self'");
  res.setHeader("Cache-Control", "no-store");
  next();
}

// No login today: the role switcher picks one of the seeded users in config/users.json by email.
// The role always comes from that server-side record, never from anything else the client sends.
export function currentUser(req: Request): User {
  const email = String(req.header("x-user-email") ?? "").trim().toLowerCase();
  if (!email) throw new ApiError(401, "NOT_SIGNED_IN", "Pick a user in the role switcher.");
  const user = users.find((u) => u.email.toLowerCase() === email);
  if (!user) throw new ApiError(401, "UNKNOWN_USER", "That user does not exist.");
  return user;
}

export function requireRole(req: Request, ...roles: Role[]): User {
  const user = currentUser(req);
  if (!roles.includes(user.role)) throw new ApiError(403, "FORBIDDEN", `This action needs the ${roles.join(" or ")} role.`);
  return user;
}

// Fixed-window limit per client for routes that spend the user's AI quota.
export function rateLimit(max: number, windowMs: number) {
  const hits = new Map<string, { count: number; reset: number }>();
  return (req: Request, _res: Response, next: NextFunction) => {
    const key = req.ip ?? "unknown";
    const t = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.reset < t) hits.set(key, { count: 1, reset: t + windowMs });
    else if (++entry.count > max) return next(new ApiError(429, "TOO_MANY_REQUESTS", "Too many generation requests. Wait a few minutes."));
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset < t) hits.delete(k);
    next();
  };
}
