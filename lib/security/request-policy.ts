import type { NextRequest } from "next/server";

type Claims = { sub?: string; organizationRole?: string; patientId?: string };
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function claims(token?: string): Claims {
  try {
    if (!token) return {};
    const part = token.split(".")[1];
    return JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as Claims;
  } catch {
    return {};
  }
}

function consume(key: string, limit: number, windowMs: number, now: number) {
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  current.count += 1;
  return {
    allowed: current.count <= limit,
    retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  };
}

export function requestPolicy(request: NextRequest) {
  const now = Date.now();
  if (buckets.size > 10_000) {
    for (const [key, value] of buckets) if (value.resetAt <= now) buckets.delete(key);
  }
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = request.headers.get("x-real-ip") || forwarded || "unknown";
  const token = request.cookies.get("nm_session")?.value;
  const actor = claims(token);
  const sensitive = request.nextUrl.pathname.startsWith("/api/auth/login")
    || request.nextUrl.pathname.startsWith("/api/auth/register")
    || request.nextUrl.pathname.startsWith("/api/auth/password-reset");
  const ipResult = consume(`ip:${ip}:${sensitive ? "auth" : "all"}`, sensitive ? 12 : 600, sensitive ? 900_000 : 60_000, now);
  if (!ipResult.allowed) return { allowed: false, retryAfter: ipResult.retryAfter, reason: "ip" };
  if (actor.sub) {
    const userResult = consume(`user:${actor.sub}`, 300, 60_000, now);
    if (!userResult.allowed) return { allowed: false, retryAfter: userResult.retryAfter, reason: "user" };
  }
  return { allowed: true, retryAfter: 0, reason: "" };
}

export function sessionClaims(request: NextRequest) {
  return claims(request.cookies.get("nm_session")?.value);
}

