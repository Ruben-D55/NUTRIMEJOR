import { createHmac, randomUUID } from "node:crypto";

export function signedServiceHeaders(secret, method, rawUrl) {
  if (!secret || secret.length < 32) throw new Error("SERVICE_API_KEY no está configurada.");
  const url = new URL(rawUrl);
  const path = `${url.pathname}${url.search}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomUUID();
  return {
    "x-service-timestamp": timestamp,
    "x-service-nonce": nonce,
    "x-service-signature": createHmac("sha256", secret)
      .update(`${timestamp}.${nonce}.${method.toUpperCase()}.${path}`)
      .digest("hex"),
  };
}
