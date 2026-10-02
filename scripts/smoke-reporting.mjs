import assert from "node:assert/strict";
import { signedServiceHeaders } from "./service-auth.mjs";

process.loadEnvFile?.();
const serviceKey = process.env.SERVICE_API_KEY;

async function request(url, { token, method = "GET", body, expectedStatus } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      ...signedServiceHeaders(serviceKey, method, url),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : undefined;
  if (expectedStatus !== undefined) {
    assert.equal(response.status, expectedStatus, `${method} ${url}: ${text}`);
    return payload;
  }
  assert.ok(response.ok, `${method} ${url}: ${response.status} ${text}`);
  return payload;
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const stamp = Date.now();
const register = (suffix) => request("http://localhost:4001/v1/users", {
  method: "POST",
  body: {
    name: `Reporting Smoke ${suffix}`,
    email: `reporting-${suffix}-${stamp}@example.test`,
    password: "Password123!",
  },
});
const [organizationA, organizationB] = await Promise.all([register("a"), register("b")]);

const patient = await request("http://localhost:4002/v1/patients", {
  token: organizationA.accessToken,
  method: "POST",
  body: {
    names: "Ana",
    lastNames: "Métricas",
    documentType: "CI",
    document: `REPORT-${stamp}`,
    birthDate: "1992-05-10",
    sex: "Femenino",
    status: "Activo",
  },
});

let patientDashboard;
for (let attempt = 0; attempt < 30; attempt += 1) {
  patientDashboard = await request(
    `http://localhost:4012/v1/dashboards/patients/${patient.id}`,
    { token: organizationA.accessToken },
  );
  if (patientDashboard.timeline.length) break;
  await wait(500);
}
assert.equal(patientDashboard.patientId, patient.id);
assert.ok(patientDashboard.domains.some((item) => item.domain === "patients"));
assert.ok(patientDashboard.timeline.some((item) => item.eventType === "patients.created.v1"));

const today = new Date().toISOString().slice(0, 10);
const organizationDashboard = await request(
  `http://localhost:4012/v1/dashboards/organization?from=${today}&to=${today}`,
  { token: organizationA.accessToken },
);
assert.ok(organizationDashboard.series.some((item) => item.eventType === "patients.created.v1"));

const rebuilt = await request("http://localhost:4012/v1/projections/rebuild", {
  token: organizationA.accessToken,
  method: "POST",
  body: {},
});
assert.equal(rebuilt.rebuilt, true);
const afterRebuild = await request(
  `http://localhost:4012/v1/dashboards/patients/${patient.id}`,
  { token: organizationA.accessToken },
);
assert.equal(afterRebuild.timeline.length, patientDashboard.timeline.length);

const isolated = await request(
  `http://localhost:4012/v1/dashboards/patients/${patient.id}`,
  { token: organizationB.accessToken },
);
assert.equal(isolated.timeline.length, 0);
assert.equal(isolated.domains.length, 0);

console.log(JSON.stringify({
  durableInbox: true,
  patientTimeline: afterRebuild.timeline.length,
  organizationSeries: organizationDashboard.series.length,
  rebuildableProjections: true,
  organizationIsolation: true,
}));
