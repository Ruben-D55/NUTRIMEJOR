import assert from "node:assert/strict";
import { gatewayUrl } from "./gateway-url.mjs";
import { execFileSync } from "node:child_process";

process.loadEnvFile?.();

async function request(url, { token, method = "GET", body } = {}) {
  url = gatewayUrl(url);
  const response = await fetch(url, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  assert.ok(response.ok, `${method} ${url}: ${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

const registration = await request("http://localhost:4001/v1/users", {
  method: "POST",
  body: { name: "Prueba Resiliencia", email: `resilience-${Date.now()}@example.test`, password: "Password123!" },
});
const token = registration.accessToken;

await request("http://localhost:4005/v1/consultations", { token });
try {
  execFileSync("docker", ["compose", "stop", "identity-api"], { stdio: "pipe" });
  const records = await request("http://localhost:4005/v1/consultations", { token });
  assert.ok(Array.isArray(records));
  console.log(JSON.stringify({ identityStopped: true, clinicalAuthorization: "local-jwks-cache", requestSucceeded: true }));
} finally {
  execFileSync("docker", ["compose", "up", "-d", "identity-api"], { stdio: "pipe" });
}
