import assert from "node:assert/strict";
import { gatewayUrl } from "./gateway-url.mjs";

process.loadEnvFile?.();
async function request(url, { token, method = "GET", body, expectedStatus } = {}) {
  url = gatewayUrl(url);
  const response = await fetch(url, {
    method,
    headers: {
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

const stamp = Date.now();
const register = (suffix) => request("http://localhost:4001/v1/users", {
  method: "POST",
  body: {
    name: `Scheduling Smoke ${suffix}`,
    email: `scheduling-${suffix}-${stamp}@example.test`,
    password: "Password123!",
  },
});
const [organizationA, organizationB] = await Promise.all([register("a"), register("b")]);
const patient = await request("http://localhost:4002/v1/patients", {
  token: organizationA.accessToken,
  method: "POST",
  body: {
    names: "Julia",
    lastNames: "Agenda",
    documentType: "CI",
    document: `SCHEDULE-${stamp}`,
    birthDate: "1990-02-02",
    sex: "Femenino",
    status: "Activo",
  },
});

const startsAt = "2030-01-07T14:00:00.000Z";
const endsAt = "2030-01-07T15:00:00.000Z";
const weekdayName = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/La_Paz",
  weekday: "short",
}).format(new Date(startsAt));
const weekday = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[weekdayName];

await request("http://localhost:4009/v1/availability/rules", {
  token: organizationA.accessToken,
  method: "POST",
  body: { weekday, startTime: "09:00", endTime: "17:00", timeZone: "America/La_Paz", slotMinutes: 30 },
});
const appointment = await request("http://localhost:4009/v1/appointments", {
  token: organizationA.accessToken,
  method: "POST",
  body: {
    patientId: patient.id,
    title: "Consulta inicial",
    type: "initial",
    startsAt,
    endsAt,
    timeZone: "America/La_Paz",
    location: "Consultorio 1",
  },
});
assert.equal(appointment.status, "scheduled");

const overlap = await request("http://localhost:4009/v1/appointments", {
  token: organizationA.accessToken,
  method: "POST",
  body: {
    patientId: patient.id,
    title: "Cita superpuesta",
    type: "follow_up",
    startsAt: "2030-01-07T14:30:00.000Z",
    endsAt: "2030-01-07T15:30:00.000Z",
    timeZone: "America/La_Paz",
  },
  expectedStatus: 409,
});
assert.equal(overlap.code, "APPOINTMENT_CONFLICT");

const outside = await request("http://localhost:4009/v1/appointments", {
  token: organizationA.accessToken,
  method: "POST",
  body: {
    patientId: patient.id,
    title: "Fuera de horario",
    type: "other",
    startsAt: "2030-01-07T02:00:00.000Z",
    endsAt: "2030-01-07T03:00:00.000Z",
    timeZone: "America/La_Paz",
  },
  expectedStatus: 422,
});
assert.equal(outside.code, "OUTSIDE_AVAILABILITY");

const confirmed = await request(`http://localhost:4009/v1/appointments/${appointment.id}/status`, {
  token: organizationA.accessToken,
  method: "POST",
  body: { status: "confirmed", expectedVersion: 1 },
});
assert.equal(confirmed.status, "confirmed");
const completed = await request(`http://localhost:4009/v1/appointments/${appointment.id}/status`, {
  token: organizationA.accessToken,
  method: "POST",
  body: { status: "completed", expectedVersion: 2 },
});
assert.equal(completed.status, "completed");
const history = await request(`http://localhost:4009/v1/appointments/${appointment.id}/history`, {
  token: organizationA.accessToken,
});
assert.deepEqual(history.map((item) => item.newStatus), ["scheduled", "confirmed", "completed"]);

const slots = await request(
  "http://localhost:4009/v1/availability/slots?from=2030-01-07T00:00:00.000Z&to=2030-01-08T00:00:00.000Z",
  { token: organizationA.accessToken },
);
assert.equal(slots.rules.length, 1);
await request(`http://localhost:4009/v1/appointments/${appointment.id}`, {
  token: organizationB.accessToken,
  expectedStatus: 404,
});

console.log(JSON.stringify({
  availabilityRules: true,
  conflictDetection: true,
  outsideAvailabilityRejected: true,
  controlledStatusHistory: history.length,
  calendarWindows: true,
  organizationIsolation: true,
}));
