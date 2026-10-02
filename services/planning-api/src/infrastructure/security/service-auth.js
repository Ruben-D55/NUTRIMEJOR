import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const MAX_CLOCK_SKEW_SECONDS = 60;
const usedNonces = new Map();

function signature(secret, timestamp, nonce, method, path) {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${nonce}.${method.toUpperCase()}.${path}`)
    .digest("hex");
}

function equal(left, right) {
  const a = Buffer.from(left || "", "utf8");
  const b = Buffer.from(right || "", "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function discardExpiredNonces(now) {
  for (const [nonce, expiresAt] of usedNonces) {
    if (expiresAt <= now) usedNonces.delete(nonce);
  }
}

export function signedServiceHeaders(secret, method, path, extra = {}) {
  if (!secret || secret.length < 32) throw new Error("SERVICE_API_KEY debe tener al menos 32 caracteres.");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomUUID();
  return {
    ...extra,
    "x-service-timestamp": timestamp,
    "x-service-nonce": nonce,
    "x-service-signature": signature(secret, timestamp, nonce, method, path),
  };
}

export function verifyServiceRequest(request, secret) {
  if (!secret || secret.length < 32) return false;
  const timestamp = String(request.headers["x-service-timestamp"] || "");
  const nonce = String(request.headers["x-service-nonce"] || "");
  const supplied = String(request.headers["x-service-signature"] || "");
  if (!/^\d{10}$/.test(timestamp) || !/^[0-9a-f-]{36}$/i.test(nonce) || !/^[0-9a-f]{64}$/i.test(supplied)) {
    return false;
  }
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > MAX_CLOCK_SKEW_SECONDS) return false;
  discardExpiredNonces(now);
  if (usedNonces.has(nonce)) return false;
  const expected = signature(secret, timestamp, nonce, request.method || "GET", request.url || "/");
  if (!equal(supplied, expected)) return false;
  usedNonces.set(nonce, now + MAX_CLOCK_SKEW_SECONDS);
  return true;
}
