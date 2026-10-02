import assert from "node:assert/strict";
import { gatewayUrl } from "./gateway-url.mjs";

process.loadEnvFile?.();
const base = "http://127.0.0.1";
async function request(url, { token, method = "GET", body } = {}) {
  url = gatewayUrl(url);
  const response = await fetch(url.replace("http://localhost", base), {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  assert.ok(response.ok, `${method} ${url}: ${response.status} ${text}`);
  return JSON.parse(text);
}
const stamp = Date.now();
const account = await request("http://localhost:4001/v1/users", {
  method: "POST",
  body: { name: "Subscription Smoke", email: `membership-${stamp}@example.test`, password: "Password123!" },
});
const trial = await request("http://localhost:4004/v1/subscriptions/current", { token: account.accessToken });
assert.equal(trial.planCode, "BASIC");
assert.equal(trial.status, "trialing");
const pro = await request("http://localhost:4004/v1/subscriptions/current", {
  token: account.accessToken,
  method: "PUT",
  body: { planCode: "PRO" },
});
assert.equal(pro.status, "active");
const canceled = await request("http://localhost:4004/v1/subscriptions/current/cancel", {
  token: account.accessToken,
  method: "POST",
  body: { reason: "Prueba de ciclo de vida" },
});
assert.equal(canceled.status, "canceled");
const disabled = await request("http://localhost:4004/v1/entitlements", { token: account.accessToken });
assert.ok(disabled.features.every((item) => item.enabled === false));
const active = await request("http://localhost:4004/v1/subscriptions/current/reactivate", {
  token: account.accessToken,
  method: "POST",
  body: {},
});
assert.equal(active.status, "active");
assert.equal(active.planCode, "PRO");
const history = await request("http://localhost:4004/v1/subscriptions/current/history", {
  token: account.accessToken,
});
assert.deepEqual(history.map((item) => item.newStatus), ["trialing", "active", "canceled", "active"]);
console.log(JSON.stringify({
  automaticTrial: true,
  planChange: true,
  cancellationDisablesEntitlements: true,
  reactivationRestoresPlan: true,
  lifecycleHistory: history.length,
}));
