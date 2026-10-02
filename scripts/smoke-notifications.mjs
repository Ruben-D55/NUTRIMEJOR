import assert from "node:assert/strict";
import { signedServiceHeaders } from "./service-auth.mjs";

process.loadEnvFile?.();
const serviceKey = process.env.SERVICE_API_KEY;
const local = (url) => url.replace("http://localhost:", "http://127.0.0.1:");
async function request(url, { token, method = "GET", body, expectedStatus } = {}) {
  const response = await fetch(local(url), {
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
    name: `Notifications Smoke ${suffix}`,
    email: `notifications-${suffix}-${stamp}@example.test`,
    password: "Password123!",
  },
});
const [organizationA, organizationB] = await Promise.all([register("a"), register("b")]);
const patient = await request("http://localhost:4002/v1/patients", {
  token: organizationA.accessToken,
  method: "POST",
  body: {
    names: "Mario",
    lastNames: "Avisos",
    documentType: "CI",
    document: `NOTICE-${stamp}`,
    birthDate: "1988-04-04",
    sex: "Masculino",
    status: "Activo",
  },
});

await request("http://localhost:4004/v1/subscriptions/current", {
  token: organizationA.accessToken,
  method: "PUT",
  body: { planCode: "PRO" },
});

const alertRule = await request("http://localhost:4010/v1/alert-rules", {
  token: organizationA.accessToken,
  method: "POST",
  body: {
    name: "Seguimiento vencido",
    ruleType: "patient_without_follow_up",
    conditions: { daysWithoutFollowUp: 30 },
    channels: ["in_app", "email"],
    leadMinutes: 0,
  },
});
assert.equal(alertRule.ruleType, "patient_without_follow_up");
const alertRules = await request("http://localhost:4010/v1/alert-rules", {
  token: organizationA.accessToken,
});
assert.ok(alertRules.some((item) => item.id === alertRule.id));
const isolatedRules = await request("http://localhost:4010/v1/alert-rules", {
  token: organizationB.accessToken,
});
assert.equal(isolatedRules.length, 0);

await request("http://localhost:4010/v1/preferences", {
  token: organizationA.accessToken,
  method: "POST",
  body: {
    patientId: patient.id,
    channel: "email",
    recipient: `patient-${stamp}@example.test`,
    reminderMinutes: 60,
  },
});
const appointment = await request("http://localhost:4009/v1/appointments", {
  token: organizationA.accessToken,
  method: "POST",
  body: {
    patientId: patient.id,
    title: "Control con recordatorio",
    type: "control",
    startsAt: "2031-04-10T14:00:00.000Z",
    endsAt: "2031-04-10T15:00:00.000Z",
    timeZone: "America/La_Paz",
  },
});
assert.equal(appointment.status, "scheduled");

let jobs = [];
for (let attempt = 0; attempt < 30; attempt += 1) {
  jobs = await request(`http://localhost:4010/v1/notification-jobs?patientId=${patient.id}`, {
    token: organizationA.accessToken,
  });
  if (jobs.some((item) => item.templateCode === "APPOINTMENT_REMINDER")) break;
  await wait(500);
}
const reminder = jobs.find((item) => item.templateCode === "APPOINTMENT_REMINDER");
assert.ok(reminder);
assert.equal(reminder.channel, "email");
assert.equal(reminder.status, "queued");

const delivered = await request("http://localhost:4010/v1/notification-jobs", {
  token: organizationA.accessToken,
  method: "POST",
  body: {
    patientId: patient.id,
    title: "Mensaje inmediato",
    channel: "in_app",
    recipient: `patient:${patient.id}`,
    body: "Su plan fue actualizado.",
    maxAttempts: 2,
  },
});
let deliveredState;
for (let attempt = 0; attempt < 20; attempt += 1) {
  deliveredState = (await request(`http://localhost:4010/v1/notification-jobs?patientId=${patient.id}`, {
    token: organizationA.accessToken,
  })).find((item) => item.id === delivered.id);
  if (deliveredState?.status === "delivered") break;
  await wait(500);
}
assert.equal(deliveredState.status, "delivered");
assert.equal(deliveredState.attemptCount, 1);

const failing = await request("http://localhost:4010/v1/notification-jobs", {
  token: organizationA.accessToken,
  method: "POST",
  body: {
    patientId: patient.id,
    title: "Proveedor fallido",
    channel: "email",
    recipient: "fail:provider",
    body: "Debe terminar en cola de fallos.",
    maxAttempts: 2,
  },
});
let failedState;
for (let attempt = 0; attempt < 30; attempt += 1) {
  failedState = (await request(`http://localhost:4010/v1/notification-jobs?patientId=${patient.id}`, {
    token: organizationA.accessToken,
  })).find((item) => item.id === failing.id);
  if (failedState?.status === "dead_letter") break;
  await wait(500);
}
assert.equal(failedState.status, "dead_letter");
assert.equal(failedState.attemptCount, 2);

const isolated = await request(`http://localhost:4010/v1/notification-jobs?patientId=${patient.id}`, {
  token: organizationB.accessToken,
});
assert.equal(isolated.length, 0);

console.log(JSON.stringify({
  schedulingEventConsumed: true,
  channelPreferences: true,
  successfulDelivery: deliveredState.attemptCount,
  retriesAndDeadLetter: failedState.attemptCount,
  organizationIsolation: true,
  configurableAlertRules: true,
}));
