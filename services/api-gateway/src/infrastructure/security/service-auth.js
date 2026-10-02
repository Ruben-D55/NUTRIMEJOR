import { createHmac, randomUUID } from "node:crypto";

export function signedHeaders(secret, method, path) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomUUID();
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${nonce}.${method.toUpperCase()}.${path}`)
    .digest("hex");
  return {
    "x-service-timestamp": timestamp,
    "x-service-nonce": nonce,
    "x-service-signature": signature,
  };
}
