import assert from "node:assert/strict";
import test from "node:test";
import { authorize } from "../src/application/authorization.js";
import { CircuitBreaker } from "../src/application/circuit-breaker.js";
import { RateLimiter } from "../src/application/rate-limiter.js";
import { gatewayPath, resolveRoute } from "../src/application/route-resolver.js";

test("resolves versioned gateway routes for every module", () => {
  assert.deepEqual(resolveRoute("/api/v1/patients/abc", "?active=true"), {
    service: "patients",
    upstreamPath: "/v1/patients/abc?active=true",
  });
  assert.deepEqual(resolveRoute("/api/v1/clinical/consultations"), {
    service: "clinical",
    upstreamPath: "/v1/consultations",
  });
  assert.equal(resolveRoute("/api/v2/patients"), null);
  assert.equal(resolveRoute("/api/v1/unknown"), null);
});

test("builds stable gateway URLs from existing service paths", () => {
  assert.equal(gatewayPath("patients", "/v1/patients?limit=20"), "/api/v1/patients?limit=20");
  assert.equal(gatewayPath("catalogs", "/v1/catalogs/foods"), "/api/v1/catalogs/foods");
  assert.equal(gatewayPath("planning", "/v1/meal-plans/123"), "/api/v1/planning/meal-plans/123");
});

test("central authorization enforces assistant and patient scope", () => {
  const assistant = { organizationRole: "ASSISTANT" };
  assert.equal(authorize(assistant, "patients", "POST", new URL("http://internal/v1/patients")), true);
  assert.equal(authorize(assistant, "clinical", "GET", new URL("http://internal/v1/consultations")), false);

  const patientId = "11111111-1111-4111-8111-111111111111";
  const patient = { organizationRole: "PATIENT", patientId };
  assert.equal(authorize(patient, "clinical", "GET", new URL(`http://internal/v1/consultations?patientId=${patientId}`)), true);
  assert.equal(authorize(patient, "clinical", "GET", new URL("http://internal/v1/consultations?patientId=22222222-2222-4222-8222-222222222222")), false);
  assert.equal(authorize(patient, "clinical", "POST", new URL(`http://internal/v1/consultations?patientId=${patientId}`)), false);
  assert.equal(authorize(patient, "scheduling", "POST", new URL("http://internal/v1/appointments"), { patientId }), true);
  assert.equal(authorize(patient, "scheduling", "POST", new URL("http://internal/v1/appointments"), {
    patientId: "22222222-2222-4222-8222-222222222222",
  }), false);
});

test("rate limiter separates IP and user buckets", () => {
  let now = 1000;
  const limiter = new RateLimiter(() => now);
  for (let index = 0; index < 12; index += 1) assert.equal(limiter.check("10.0.0.1", null, true).allowed, true);
  assert.equal(limiter.check("10.0.0.1", null, true).allowed, false);
  now += 900001;
  assert.equal(limiter.check("10.0.0.1", null, true).allowed, true);
});

test("circuit breaker opens and permits one half-open probe", () => {
  let now = 1000;
  const breaker = new CircuitBreaker({ threshold: 2, openMs: 5000, now: () => now });
  assert.equal(breaker.canRequest("patients"), true);
  breaker.failure("patients");
  breaker.failure("patients");
  assert.equal(breaker.canRequest("patients"), false);
  now += 5001;
  assert.equal(breaker.canRequest("patients"), true);
  assert.equal(breaker.canRequest("patients"), false);
  breaker.success("patients");
  assert.equal(breaker.canRequest("patients"), true);
});
