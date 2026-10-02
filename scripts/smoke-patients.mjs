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

const stamp = Date.now();
const register = (suffix) => request("http://localhost:4001/v1/users", {
  method: "POST",
  body: {
    name: `Paciente Smoke ${suffix}`,
    email: `patients-${suffix}-${stamp}@example.test`,
    password: "Password123!",
  },
});
const [organizationA, organizationB] = await Promise.all([register("a"), register("b")]);

const patientInput = {
  names: "María Elena",
  lastNames: "Quispe Flores",
  preferredName: "María",
  documentType: "CI",
  document: `SMOKE-${stamp}`,
  birthDate: "1992-04-18",
  sex: "Femenino",
  phone: "+59170000000",
  email: `patient-${stamp}@example.test`,
  address: "Av. Integración 123",
  city: "La Paz",
  country: "BO",
  objective: "Seguimiento nutricional integral",
  status: "Activo",
};

const created = await request("http://localhost:4002/v1/patients", {
  token: organizationA.accessToken,
  method: "POST",
  body: patientInput,
});
assert.equal(created.names, patientInput.names);
assert.equal(created.document, patientInput.document);
assert.equal(created.version, 1);

const duplicate = await request("http://localhost:4002/v1/patients", {
  token: organizationA.accessToken,
  method: "POST",
  body: { ...patientInput, email: `other-${stamp}@example.test` },
  expectedStatus: 409,
});
assert.equal(duplicate.code, "PATIENT_DUPLICATE");

const fetched = await request(`http://localhost:4002/v1/patients/${created.id}`, {
  token: organizationA.accessToken,
});
assert.equal(fetched.id, created.id);

await request(`http://localhost:4002/v1/patients/${created.id}/contacts`, {
  token: organizationA.accessToken,
  method: "POST",
  body: { type: "whatsapp", value: "+59170000000", label: "Personal", primary: true },
});
await request(`http://localhost:4002/v1/patients/${created.id}/emergency-contacts`, {
  token: organizationA.accessToken,
  method: "POST",
  body: { name: "Luis Quispe", relationship: "Hermano", phone: "+59171111111", primary: true },
});
await request(`http://localhost:4002/v1/patients/${created.id}/assignments`, {
  token: organizationA.accessToken,
  method: "POST",
  body: { userId: organizationA.user.id, role: "NUTRITIONIST" },
});
const tag = await request(`http://localhost:4002/v1/patients/${created.id}/tags`, {
  token: organizationA.accessToken,
  method: "POST",
  body: { name: `Prioridad ${stamp}`, color: "#047857" },
});
await request(`http://localhost:4002/v1/patients/${created.id}/consents`, {
  token: organizationA.accessToken,
  method: "POST",
  body: { type: "privacy", status: "granted", documentVersion: "1.0", evidence: "digital" },
});
await request(`http://localhost:4002/v1/patients/${created.id}/history`, {
  token: organizationA.accessToken,
  method: "POST",
  body: { type: "administrative_note", notes: "Registro verificado durante la prueba de humo." },
});

const [contacts, emergencies, assignments, tags, consents, history] = await Promise.all([
  request(`http://localhost:4002/v1/patients/${created.id}/contacts`, { token: organizationA.accessToken }),
  request(`http://localhost:4002/v1/patients/${created.id}/emergency-contacts`, { token: organizationA.accessToken }),
  request(`http://localhost:4002/v1/patients/${created.id}/assignments`, { token: organizationA.accessToken }),
  request(`http://localhost:4002/v1/patients/${created.id}/tags`, { token: organizationA.accessToken }),
  request(`http://localhost:4002/v1/patients/${created.id}/consents`, { token: organizationA.accessToken }),
  request(`http://localhost:4002/v1/patients/${created.id}/history`, { token: organizationA.accessToken }),
]);
assert.equal(contacts.length, 1);
assert.equal(emergencies.length, 1);
assert.equal(assignments.length, 1);
assert.ok(tags.some((item) => item.id === tag.id));
assert.equal(consents.length, 1);
assert.ok(history.some((item) => item.type === "administrative_note"));
assert.ok(history.some((item) => item.type === "patient_created"));

const page = await request(`http://localhost:4002/v1/patients?limit=1&tagId=${tag.id}`, {
  token: organizationA.accessToken,
});
assert.equal(page.items.length, 1);
assert.equal(page.items[0].id, created.id);

const isolated = await request("http://localhost:4002/v1/patients?limit=10", {
  token: organizationB.accessToken,
});
assert.ok(!isolated.items.some((item) => item.id === created.id));

await request(`http://localhost:4002/v1/patients/${created.id}`, {
  token: organizationA.accessToken,
  method: "DELETE",
  expectedStatus: 204,
});
await request(`http://localhost:4002/v1/patients/${created.id}`, {
  token: organizationA.accessToken,
  expectedStatus: 404,
});
const afterArchive = await request("http://localhost:4002/v1/patients?limit=100", {
  token: organizationA.accessToken,
});
assert.ok(!afterArchive.items.some((item) => item.id === created.id));

console.log(JSON.stringify({
  patientAdministration: true,
  duplicateDetection: true,
  cursorPagination: true,
  nestedResources: {
    contacts: contacts.length,
    emergencyContacts: emergencies.length,
    assignments: assignments.length,
    tags: tags.length,
    consents: consents.length,
  },
  administrativeHistory: history.length,
  organizationIsolation: true,
  softDelete: true,
}));
