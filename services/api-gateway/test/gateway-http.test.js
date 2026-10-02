import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { CircuitBreaker } from "../src/application/circuit-breaker.js";
import { RateLimiter } from "../src/application/rate-limiter.js";
import { createServer } from "../src/interfaces/http/server.js";

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test("proxies through one versioned endpoint and retries transient reads", async (context) => {
  let upstreamAttempts = 0;
  let receivedCorrelation;
  const upstream = http.createServer((request, response) => {
    upstreamAttempts += 1;
    receivedCorrelation = request.headers["x-correlation-id"];
    if (upstreamAttempts === 1) {
      response.writeHead(503, { "content-type": "application/json" });
      return response.end(JSON.stringify({ error: "try again" }));
    }
    response.writeHead(200, { "content-type": "application/json" });
    return response.end(JSON.stringify({ path: request.url }));
  });
  const upstreamPort = await listen(upstream);
  context.after(() => close(upstream));

  const baseUrl = `http://127.0.0.1:${upstreamPort}`;
  const serviceUrls = Object.fromEntries([
    "identity", "patients", "catalogs", "subscriptions", "clinical", "measurements",
    "nutrition", "planning", "scheduling", "notifications", "documents", "reporting",
  ].map((service) => [service, baseUrl]));
  const config = {
    serviceUrls,
    serviceKey: "gateway-test-key-with-more-than-32-characters",
    allowedOrigins: new Set(["http://localhost:3000"]),
    timeoutMs: 1000,
    retries: 1,
  };
  const verifier = { verify: async () => ({ id: "user-1", organizationRole: "OWNER" }) };
  const gateway = createServer(config, verifier, new RateLimiter(), new CircuitBreaker());
  const gatewayPort = await listen(gateway);
  context.after(() => close(gateway));

  const correlation = "phase4-integration-123";
  const response = await fetch(`http://127.0.0.1:${gatewayPort}/api/v1/clinical/consultations?active=true`, {
    headers: {
      authorization: "Bearer test",
      origin: "http://localhost:3000",
      "x-correlation-id": correlation,
    },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-gateway-attempts"), "2");
  assert.equal(response.headers.get("x-correlation-id"), correlation);
  assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:3000");
  assert.equal(receivedCorrelation, correlation);
  assert.equal(upstreamAttempts, 2);
  assert.equal(payload.path, "/v1/consultations?active=true");
});

test("rejects missing tokens and origins outside the CORS allowlist", async (context) => {
  const serviceUrls = Object.fromEntries([
    "identity", "patients", "catalogs", "subscriptions", "clinical", "measurements",
    "nutrition", "planning", "scheduling", "notifications", "documents", "reporting",
  ].map((service) => [service, "http://127.0.0.1:1"]));
  const config = {
    serviceUrls,
    serviceKey: "gateway-test-key-with-more-than-32-characters",
    allowedOrigins: new Set(["http://localhost:3000"]),
    timeoutMs: 250,
    retries: 0,
  };
  const gateway = createServer(config, { verify: async () => { throw new Error("invalid"); } }, new RateLimiter(), new CircuitBreaker());
  const gatewayPort = await listen(gateway);
  context.after(() => close(gateway));

  const unauthorized = await fetch(`http://127.0.0.1:${gatewayPort}/api/v1/patients`);
  assert.equal(unauthorized.status, 401);
  assert.equal((await unauthorized.json()).code, "UNAUTHORIZED");

  const denied = await fetch(`http://127.0.0.1:${gatewayPort}/api/v1/patients`, {
    headers: { origin: "https://outside.example" },
  });
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).code, "CORS_DENIED");
});
