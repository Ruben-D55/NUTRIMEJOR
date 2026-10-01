import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const serviceKey = process.env.SERVICE_API_KEY || "local-service-key-change-me-1234";
const local = (url) => url.replace("http://localhost:", "http://127.0.0.1:");
async function request(url, { token, method = "GET", body, expectedStatus } = {}) {
  const response = await fetch(local(url), {
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
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const stamp = Date.now();
const register = (suffix) => request("http://localhost:4001/v1/users", {
  method: "POST",
  body: {
    name: `Documents Smoke ${suffix}`,
    email: `documents-${suffix}-${stamp}@example.test`,
    password: "Password123!",
  },
});
const [organizationA, organizationB] = await Promise.all([register("a"), register("b")]);
const patient = await request("http://localhost:4002/v1/patients", {
  token: organizationA.accessToken,
  method: "POST",
  body: {
    names: "Laura",
    lastNames: "Documento",
    documentType: "CI",
    document: `PDF-${stamp}`,
    birthDate: "1994-06-12",
    sex: "Femenino",
    status: "Activo",
  },
});
const template = await request("http://localhost:4011/v1/templates", {
  token: organizationA.accessToken,
  method: "POST",
  body: {
    name: "Plan nutricional verde",
    documentType: "meal_plan",
    definition: {
      organizationName: "Centro Nutricional Habito Sano",
      primaryColor: "#166534",
      footer: "Uso personal del paciente",
    },
  },
});
const created = await request("http://localhost:4011/v1/generated-documents", {
  token: organizationA.accessToken,
  method: "POST",
  body: {
    patientId: patient.id,
    title: "Plan nutricional semanal",
    documentType: "meal_plan",
    templateId: template.id,
    patientDisplayName: "Laura Documento",
    sections: [
      { type: "heading", text: "Objetivo" },
      { type: "paragraph", text: "Mantener una alimentación variada, suficiente y adaptada al seguimiento profesional." },
      { type: "key_value", items: [
        { label: "Energía diaria", value: "2.050 kcal" },
        { label: "Proteínas", value: "110 g" },
        { label: "Hidratación", value: "2,2 litros" },
      ] },
      { type: "heading", text: "Menú de ejemplo" },
      { type: "table", columns: ["Tiempo", "Preparación", "Porción"], rows: [
        ["Desayuno", "Avena con fruta", "1 plato"],
        ["Almuerzo", "Pollo, arroz y ensalada", "1 plato"],
        ["Cena", "Sopa de verduras", "1 plato"],
      ] },
      { type: "heading", text: "Recomendaciones" },
      { type: "paragraph", text: "Registrar tolerancia, apetito y cualquier síntoma para revisarlos en el siguiente control." },
    ],
  },
});
assert.equal(created.status, "queued");

let document;
for (let attempt = 0; attempt < 30; attempt += 1) {
  document = await request(`http://localhost:4011/v1/generated-documents/${created.id}`, {
    token: organizationA.accessToken,
  });
  if (["completed", "failed"].includes(document.status)) break;
  await wait(500);
}
assert.equal(document.status, "completed", document.failureReason);
assert.equal(document.contentType, "application/pdf");
assert.match(document.sha256, /^[a-f0-9]{64}$/);

const access = await request(`http://localhost:4011/v1/generated-documents/${created.id}/access-url`, {
  token: organizationA.accessToken,
  method: "POST",
  body: { expiresInMinutes: 15 },
});
const download = await fetch(local(access.url));
assert.equal(download.status, 200);
assert.equal(download.headers.get("content-type"), "application/pdf");
const bytes = Buffer.from(await download.arrayBuffer());
assert.equal(bytes.subarray(0, 4).toString("ascii"), "%PDF");
assert.equal(createHash("sha256").update(bytes).digest("hex"), document.sha256);
await mkdir("output/pdf", { recursive: true });
await writeFile("output/pdf/nutrimejor-sample-plan.pdf", bytes);

await request(`http://localhost:4011/v1/generated-documents/${created.id}`, {
  token: organizationB.accessToken,
  expectedStatus: 404,
});

console.log(JSON.stringify({
  asynchronousGeneration: true,
  templateVersion: template.version,
  sha256Verified: true,
  temporaryAccessUrl: true,
  pdfBytes: bytes.length,
  organizationIsolation: true,
  output: "output/pdf/nutrimejor-sample-plan.pdf",
}));
