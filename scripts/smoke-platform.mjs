import assert from "node:assert/strict";

const serviceKey = process.env.SERVICE_API_KEY || "local-service-key-change-me-1234";

async function request(url, { token, method = "GET", body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      "x-service-key": serviceKey,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(`${method} ${url} returned ${response.status}: ${JSON.stringify(payload)}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

for (let port = 4001; port <= 4012; port += 1) {
  const health = await request(`http://localhost:${port}/health/ready`);
  assert.equal(health.status, "ready");
}

const stamp = Date.now();
const register = (suffix) => request("http://localhost:4001/v1/users", {
  method: "POST",
  body: { name: `Prueba ${suffix}`, email: `smoke-${suffix}-${stamp}@example.test`, password: "Password123!" },
});
const [organizationA, organizationB] = await Promise.all([register("A"), register("B")]);
assert.notEqual(organizationA.user.organizationId, organizationB.user.organizationId);

const previousRefreshToken = organizationA.refreshToken;
const renewed = await request("http://localhost:4001/v1/sessions/refresh", {
  method: "POST",
  body: { refreshToken: previousRefreshToken },
});
assert.notEqual(renewed.refreshToken, previousRefreshToken);
organizationA.accessToken = renewed.accessToken;
let reusedRefreshStatus;
try {
  await request("http://localhost:4001/v1/sessions/refresh", {
    method: "POST",
    body: { refreshToken: previousRefreshToken },
  });
} catch (error) {
  reusedRefreshStatus = error.status;
}
assert.equal(reusedRefreshStatus, 401);

const resetRequest = await request("http://localhost:4001/v1/password-resets", {
  method: "POST",
  body: { email: `smoke-b-${stamp}@example.test` },
});
assert.equal(resetRequest.resetToken.length, 64);
await request("http://localhost:4001/v1/password-resets/confirm", {
  method: "POST",
  body: {
    token: resetRequest.resetToken,
    newPassword: "UpdatedPassword123!",
    confirmation: "UpdatedPassword123!",
  },
});
let oldPasswordStatus;
try {
  await request("http://localhost:4001/v1/sessions", {
    method: "POST",
    body: { email: `smoke-b-${stamp}@example.test`, password: "Password123!" },
  });
} catch (error) {
  oldPasswordStatus = error.status;
}
assert.equal(oldPasswordStatus, 401);
const recoveredSession = await request("http://localhost:4001/v1/sessions", {
  method: "POST",
  body: { email: `smoke-b-${stamp}@example.test`, password: "UpdatedPassword123!" },
});
organizationB.accessToken = recoveredSession.accessToken;

const audit = await request("http://localhost:4001/v1/audit/access?limit=20", {
  token: organizationA.accessToken,
});
assert.ok(audit.some((event) => event.eventType === "registration" && event.success));

const patient = await request("http://localhost:4002/v1/patients", {
  token: organizationA.accessToken,
  method: "POST",
  body: {
    names: "Paciente",
    lastNames: "Plataforma",
    documentType: "CI",
    document: `PLATFORM-${stamp}`,
    birthDate: "1990-01-01",
    sex: "Otro",
    status: "Activo",
  },
});
const created = await request("http://localhost:4005/v1/consultations", {
  token: organizationA.accessToken,
  method: "POST",
  body: { patientId: patient.id, title: "Consulta aislada", data: { source: "smoke" } },
});
const [visibleA, visibleB] = await Promise.all([
  request("http://localhost:4005/v1/consultations", { token: organizationA.accessToken }),
  request("http://localhost:4005/v1/consultations", { token: organizationB.accessToken }),
]);
assert.ok(visibleA.some((item) => item.id === created.id));
assert.ok(!visibleB.some((item) => item.id === created.id));

const current = await request("http://localhost:4004/v1/subscriptions/current", { token: organizationA.accessToken });
assert.equal(current.planCode, "BASIC");
const basicEntitlements = await request("http://localhost:4004/v1/entitlements", { token: organizationA.accessToken });
assert.ok(basicEntitlements.features.some((feature) => feature.code === "documents.pdf" && feature.enabled));

let disabledStatus;
try {
  await request("http://localhost:4004/v1/usage/consume", {
    token: organizationA.accessToken,
    method: "POST",
    body: { featureCode: "planning.generator", amount: 1 },
  });
} catch (error) {
  disabledStatus = error.status;
}
assert.equal(disabledStatus, 403);

const pdfUsage = await request("http://localhost:4004/v1/usage/consume", {
  token: organizationA.accessToken,
  method: "POST",
  body: { featureCode: "documents.pdf", amount: 2 },
});
assert.equal(pdfUsage.used, 2);

const upgraded = await request("http://localhost:4004/v1/subscriptions/current", {
  token: organizationA.accessToken,
  method: "PUT",
  body: { planCode: "PRO" },
});
assert.equal(upgraded.planCode, "PRO");
const generatorUsage = await request("http://localhost:4004/v1/usage/consume", {
  token: organizationA.accessToken,
  method: "POST",
  body: { featureCode: "planning.generator", amount: 1 },
});
assert.equal(generatorUsage.used, 1);

console.log(JSON.stringify({
  servicesReady: 12,
  organizationIsolation: true,
  initialPlan: current.planCode,
  upgradedPlan: upgraded.planCode,
  quotaConsumption: { pdf: pdfUsage.used, generator: generatorUsage.used },
  refreshRotation: true,
  passwordRecovery: true,
  accessAudit: true,
}));
