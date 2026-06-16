import type { H3Event } from "h3";
import { createError } from "h3";
import { logger } from "#shared/logger";

export interface ApiError {
  error: string;
  message: string;
}

export function sendAuthError(status: number, error: string, message: string): never {
  throw createError({
    status,
    statusText: status.toString(),
    message: JSON.stringify({ error, message } satisfies ApiError),
  });
}

export function sendValidationError(message: string): never {
  sendAuthError(400, "validation_error", message);
}

export function sendConflictError(message: string): never {
  sendAuthError(409, "conflict", message);
}

export function sendUnauthorizedError(message: string): never {
  sendAuthError(401, "unauthorized", message);
}

export function sendNotFoundError(message: string): never {
  sendAuthError(404, "not_found", message);
}

export function sendForbiddenError(message: string): never {
  sendAuthError(403, "forbidden", message);
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 5;

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}, 30_000);

export function checkRateLimit(event: H3Event, email: string): void {
  const now = Date.now();
  const key = `auth:${email}`;
  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }

  entry.count++;

  if (entry.count > MAX_REQUESTS) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    const resetAt = entry.resetAt;

    setResponseHeaders(event, {
      "Retry-After": String(retryAfter),
      "RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
      "RateLimit-Remaining": "0",
    });

    throw createError({
      status: 429,
      statusText: "429",
      message: JSON.stringify({
        error: "rate_limit_exceeded",
        message: "Too many requests. Please try again later.",
      } satisfies ApiError),
    });
  }
}

interface LockoutEntry {
  failedAttempts: number;
  lockedUntil: number | null;
}

const lockoutStore = new Map<string, LockoutEntry>();

const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000;

export function checkAccountLockout(email: string): void {
  const entry = lockoutStore.get(email);

  if (entry?.lockedUntil && entry.lockedUntil > Date.now()) {
    sendUnauthorizedError("Account locked due to too many failed attempts. Please try again later.");
  }

  if (entry?.lockedUntil && entry.lockedUntil <= Date.now()) {
    lockoutStore.delete(email);
  }
}

export function recordFailedAttempt(email: string): void {
  const now = Date.now();
  const entry = lockoutStore.get(email);

  if (!entry || (entry.lockedUntil && entry.lockedUntil <= now)) {
    lockoutStore.set(email, { failedAttempts: 1, lockedUntil: null });
    return;
  }

  entry.failedAttempts++;

  if (entry.failedAttempts >= MAX_FAILED_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_DURATION_MS;
    logger.warn("Account locked due to failed attempts", { email });
  }
}

export function resetFailedAttempts(email: string): void {
  lockoutStore.delete(email);
}

export function handleDatabaseError(error: unknown): never {
  logger.error("Database unreachable", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });

  sendAuthError(503, "service_unavailable", "Service temporarily unavailable. Please try again later.");
}

export function handleUpstreamTimeout(): never {
  sendAuthError(503, "upstream_timeout", "Authentication service timed out. Please try again.");
}
