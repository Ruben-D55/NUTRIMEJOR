import assert from "node:assert/strict";

const serviceKey = process.env.SERVICE_API_KEY || "local-service-key-change-me-1234";

async function request(url, { token, method = "GET", body, expectedStatus } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      "x-service-key": serviceKey,
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
    name: `Clinical Smoke ${suffix}`,
    email: `clinical-${suffix}-${stamp}@example.test`,
    password: "Password123!",
  },
});
const [organizationA, organizationB] = await Promise.all([register("a"), register("b")]);

const patient = await request("http://localhost:4002/v1/patients", {
  token: organizationA.accessToken,
  method: "POST",
  body: {
    names: "Ana",
    lastNames: "Mendoza",
    documentType: "CI",
    document: `CLINICAL-${stamp}`,
    birthDate: "1987-06-14",
    sex: "Femenino",
    status: "Activo",
  },
});

const consultation = await request("http://localhost:4005/v1/consultations", {
  token: organizationA.accessToken,
  method: "POST",
  body: {
    patientId: patient.id,
    title: "Consulta inicial",
    consultationType: "initial",
    data: { reason: "Evaluación integral", initial: true },
  },
});
assert.equal(consultation.status, "draft");
assert.equal(consultation.version, 1);

const medication = await request(
  `http://localhost:4005/v1/patients/${patient.id}/clinical-entries`,
  {
    token: organizationA.accessToken,
    method: "POST",
    body: {
      consultationId: consultation.id,
      category: "medication",
      title: "Metformina",
      details: { dose: "500 mg", frequency: "cada 12 horas", route: "oral" },
      startDate: "2026-01-10T12:00:00.000Z",
    },
  },
);
assert.equal(medication.category, "medication");

await request(`http://localhost:4005/v1/consultations/${consultation.id}/diagnoses`, {
  token: organizationA.accessToken,
  method: "POST",
  body: {
    code: "NI-1.4",
    statement: "Ingesta energética inadecuada",
    etiology: "Distribución irregular de comidas",
    signs: "Recordatorio de 24 horas",
  },
});
await request(`http://localhost:4005/v1/consultations/${consultation.id}/goals`, {
  token: organizationA.accessToken,
  method: "POST",
  body: { title: "Regularizar comidas", targetValue: 5, unit: "comidas/día" },
});
await request(`http://localhost:4005/v1/consultations/${consultation.id}/follow-ups`, {
  token: organizationA.accessToken,
  method: "POST",
  body: { summary: "Control en dos semanas", adherence: 80, nextSteps: "Revisar tolerancia" },
});

const published = await request(`http://localhost:4005/v1/consultations/${consultation.id}/publish`, {
  token: organizationA.accessToken,
  method: "POST",
  body: { expectedVersion: 1, reason: "Validada por la nutricionista" },
});
assert.equal(published.status, "published");

const rejectedOverwrite = await request(`http://localhost:4005/v1/consultations/${consultation.id}`, {
  token: organizationA.accessToken,
  method: "PUT",
  body: {
    patientId: patient.id,
    title: "Intento de sobrescritura",
    consultationType: "initial",
    data: {},
    expectedVersion: 1,
  },
  expectedStatus: 409,
});
assert.equal(rejectedOverwrite.code, "CONSULTATION_NOT_DRAFT");

const corrected = await request(`http://localhost:4005/v1/consultations/${consultation.id}/corrections`, {
  token: organizationA.accessToken,
  method: "POST",
  body: {
    patientId: patient.id,
    title: "Consulta inicial corregida",
    consultationType: "initial",
    data: { reason: "Evaluación integral", initial: true, correction: "Dato aclarado" },
    expectedVersion: 1,
    reason: "Se aclaró el motivo de consulta",
  },
});
assert.equal(corrected.status, "published");
assert.equal(corrected.version, 2);

const versions = await request(`http://localhost:4005/v1/consultations/${consultation.id}/versions`, {
  token: organizationA.accessToken,
});
assert.equal(versions.length, 2);
assert.equal(versions[0].snapshot.data.correction, undefined);
assert.equal(versions[1].snapshot.data.correction, "Dato aclarado");
assert.equal(versions[1].isCorrection, true);

const legacyBody = {
  patientId: patient.id,
  legacyHistoryId: `legacy-${stamp}`,
  type: "Antecedente migrado",
  notes: "Dato conservado desde Patients DB",
  recordedAt: "2025-02-03T10:00:00.000Z",
};
const firstImport = await request("http://localhost:4005/v1/migrations/patient-history", {
  token: organizationA.accessToken,
  method: "POST",
  body: legacyBody,
});
const secondImport = await request("http://localhost:4005/v1/migrations/patient-history", {
  token: organizationA.accessToken,
  method: "POST",
  body: legacyBody,
});
assert.equal(firstImport.imported, true);
assert.equal(secondImport.imported, false);

const [clinicalRecord, timeline, entries, diagnoses, goals, followUps] = await Promise.all([
  request(`http://localhost:4005/v1/patients/${patient.id}/clinical-record`, { token: organizationA.accessToken }),
  request(`http://localhost:4005/v1/patients/${patient.id}/timeline`, { token: organizationA.accessToken }),
  request(`http://localhost:4005/v1/patients/${patient.id}/clinical-entries`, { token: organizationA.accessToken }),
  request(`http://localhost:4005/v1/consultations/${consultation.id}/diagnoses`, { token: organizationA.accessToken }),
  request(`http://localhost:4005/v1/consultations/${consultation.id}/goals`, { token: organizationA.accessToken }),
  request(`http://localhost:4005/v1/consultations/${consultation.id}/follow-ups`, { token: organizationA.accessToken }),
]);
assert.equal(clinicalRecord.patientId, patient.id);
assert.ok(timeline.some((item) => item.eventType === "consultation_published"));
assert.ok(timeline.some((item) => item.eventType === "consultation_corrected"));
assert.ok(entries.some((item) => item.category === "medication"));
assert.ok(entries.some((item) => item.source === "patients-db"));
assert.equal(diagnoses.length, 1);
assert.equal(goals.length, 1);
assert.equal(followUps.length, 1);

await request(`http://localhost:4005/v1/consultations/${consultation.id}`, {
  token: organizationB.accessToken,
  expectedStatus: 404,
});

console.log(JSON.stringify({
  versionedConsultation: true,
  immutablePublishedVersion: true,
  correctionVersion: corrected.version,
  clinicalEntries: entries.length,
  diagnoses: diagnoses.length,
  goals: goals.length,
  followUps: followUps.length,
  timelineEvents: timeline.length,
  legacyImportIdempotent: true,
  organizationIsolation: true,
}));
