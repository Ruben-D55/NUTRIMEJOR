import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { signedServiceHeaders, verifyServiceRequest } from "../src/infrastructure/security/service-auth.js";

const secret = "security-test-key-with-more-than-32-characters";

test("accepts a signed internal request only once", () => {
  const headers = signedServiceHeaders(secret, "POST", "/v1/sessions");
  const request = { method: "POST", url: "/v1/sessions", headers };
  assert.equal(verifyServiceRequest(request, secret), true);
  assert.equal(verifyServiceRequest(request, secret), false);
});

test("rejects expired service proofs", () => {
  const timestamp = String(Math.floor(Date.now() / 1000) - 120);
  const nonce = randomUUID();
  const path = "/v1/patients";
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${nonce}.GET.${path}`)
    .digest("hex");
  assert.equal(verifyServiceRequest({ method: "GET", url: path, headers: {
    "x-service-timestamp": timestamp,
    "x-service-nonce": nonce,
    "x-service-signature": signature,
  } }, secret), false);
});

