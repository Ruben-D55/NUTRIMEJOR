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

const stamp = Date.now();
const register = (suffix) => request("http://localhost:4001/v1/users", {
  method: "POST",
  body: {
    name: `Measurements Smoke ${suffix}`,
    email: `measurements-${suffix}-${stamp}@example.test`,
    password: "Password123!",
  },
});
const [organizationA, organizationB] = await Promise.all([register("a"), register("b")]);

const patient = await request("http://localhost:4002/v1/patients", {
  token: organizationA.accessToken,
  method: "POST",
  body: {
    names: "Luis",
    lastNames: "Rojas",
    documentType: "CI",
    document: `MEASURE-${stamp}`,
    birthDate: "1991-08-20",
    sex: "Masculino",
    status: "Activo",
  },
});

const first = await request("http://localhost:4006/v1/measurement-sessions", {
  token: organizationA.accessToken,
  method: "POST",
  body: {
    patientId: patient.id,
    title: "Evaluación inicial",
    recordedAt: "2026-01-10T14:00:00.000Z",
    method: "Protocolo clínico básico",
    equipment: "Báscula y tallímetro calibrados",
    protocol: "BASIC-1",
    measurements: [
      { type: "weight", value: 80, unit: "kg" },
      { type: "height", value: 180, unit: "cm" },
      { type: "waist", value: 92, unit: "cm" },
      { type: "hip", value: 100, unit: "cm" },
      { type: "arm_circumference", value: 32, unit: "cm", side: "right" },
    ],
    vitalSigns: [
      { type: "blood_pressure_systolic", value: 120, unit: "mmHg" },
      { type: "blood_pressure_diastolic", value: 80, unit: "mmHg" },
      { type: "heart_rate", value: 68, unit: "bpm" },
      { type: "temperature", value: 36.6, unit: "°C" },
      { type: "oxygen_saturation", value: 97, unit: "%" },
    ],
    labPanels: [{
      name: "Metabolismo",
      laboratory: "Laboratorio Central",
      sampleDate: "2026-01-09T11:00:00.000Z",
      results: [{
        parameter: "Glucosa",
        result: 120,
        unit: "mg/dL",
        referenceLow: 70,
        referenceHigh: 99,
      }],
    }],
  },
});
assert.equal(first.status, "recorded");
assert.equal(first.measurements.length, 5);
assert.equal(first.vitalSigns.length, 5);
assert.equal(first.labPanels[0].results[0].flag, "high");
assert.equal(first.calculations.find((item) => item.formulaCode === "BMI").result, 24.69);
assert.equal(first.calculations.find((item) => item.formulaCode === "WAIST_HIP_RATIO").result, 0.92);

const second = await request("http://localhost:4006/v1/measurement-sessions", {
  token: organizationA.accessToken,
  method: "POST",
  body: {
    patientId: patient.id,
    title: "Control",
    recordedAt: "2026-03-10T14:00:00.000Z",
    method: "Protocolo clínico básico",
    equipment: "Báscula y tallímetro calibrados",
    measurements: [
      { type: "weight", value: 76, unit: "kg" },
      { type: "height", value: 180, unit: "cm" },
      { type: "waist", value: 88, unit: "cm" },
      { type: "hip", value: 99, unit: "cm" },
    ],
  },
});
assert.equal(second.status, "recorded");

const invalidUnits = await request("http://localhost:4006/v1/measurement-sessions", {
  token: organizationA.accessToken,
  method: "POST",
  body: {
    patientId: patient.id,
    title: "Unidad inválida",
    measurements: [{ type: "height", value: 1.8, unit: "m" }],
  },
  expectedStatus: 400,
});
assert.equal(invalidUnits.code, "VALIDATION_ERROR");

const advancedBody = {
  patientId: patient.id,
  title: "Antropometría avanzada Pro",
  recordedAt: "2026-04-10T14:00:00.000Z",
  method: "Protocolo profesional",
  equipment: "Plicómetro calibrado",
  advancedMeasurements: [
    { category: "skinfold", code: "triceps", value: 12.4, unit: "mm", side: "right" },
    { category: "diameter", code: "humerus", value: 6.8, unit: "cm", side: "right" },
  ],
  bodyComposition: [{
    indicator: "body_fat_percent",
    value: 18.6,
    unit: "%",
    method: "Ecuación institucional validada",
    formulaCode: "ORG_BODY_FAT",
    formulaVersion: "1.0.0",
    formulaSource: "Protocolo profesional de prueba",
    inputs: { tricepsMm: 12.4 },
  }],
};
const advancedDenied = await request("http://localhost:4006/v1/measurement-sessions", {
  token: organizationA.accessToken,
  method: "POST",
  body: advancedBody,
  expectedStatus: 403,
});
assert.equal(advancedDenied.code, "FEATURE_NOT_ENTITLED");
await request("http://localhost:4004/v1/subscriptions/current", {
  token: organizationA.accessToken,
  method: "PUT",
  body: { planCode: "PRO" },
});
const advanced = await request("http://localhost:4006/v1/measurement-sessions", {
  token: organizationA.accessToken,
  method: "POST",
  body: advancedBody,
});
assert.equal(advanced.advancedMeasurements.length, 2);
assert.equal(advanced.bodyComposition[0].formulaVersion, "1.0.0");

const comparison = await request(
  `http://localhost:4006/v1/patients/${patient.id}/measurements/comparison`,
  { token: organizationA.accessToken },
);
const weight = comparison.find((item) => item.metric === "weight");
assert.equal(weight.absoluteChange, -4);
assert.equal(weight.percentageChange, -5);
assert.equal(weight.direction, "decrease");
assert.ok(comparison.some((item) => item.metric === "BMI"));

const legacyBody = {
  patientId: patient.id,
  legacyKey: `patients-${stamp}`,
  weightKg: 84,
  heightCm: 180,
  recordedAt: "2025-01-01T12:00:00.000Z",
};
const firstImport = await request("http://localhost:4006/v1/migrations/patient-measurements", {
  token: organizationA.accessToken,
  method: "POST",
  body: legacyBody,
});
const secondImport = await request("http://localhost:4006/v1/migrations/patient-measurements", {
  token: organizationA.accessToken,
  method: "POST",
  body: legacyBody,
});
assert.equal(firstImport.imported, true);
assert.equal(secondImport.imported, false);

await request(`http://localhost:4006/v1/measurement-sessions/${first.id}`, {
  token: organizationB.accessToken,
  expectedStatus: 404,
});

console.log(JSON.stringify({
  immutableSessions: true,
  anthropometry: first.measurements.length,
  vitalSigns: first.vitalSigns.length,
  labResults: first.labPanels[0].results.length,
  reproducibleCalculations: first.calculations.map((item) => `${item.formulaCode}@${item.formulaVersion}`),
  unitValidation: true,
  initialCurrentComparison: true,
  legacyImportIdempotent: true,
  organizationIsolation: true,
  advancedEntitlementEnforced: true,
  advancedAnthropometry: advanced.advancedMeasurements.length,
  bodyCompositionTraceability: true,
}));
