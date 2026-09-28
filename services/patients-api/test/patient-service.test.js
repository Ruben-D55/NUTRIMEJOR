import test from "node:test";
import assert from "node:assert/strict";
import { PatientService } from "../src/application/patient-service.js";

const actor = { id: 4, role: "NUTRICIONISTA" };
const validPatient = {
  names: "Lucía",
  lastNames: "Rojas",
  document: "7845123",
  birthDate: "1992-05-18",
  sex: "Femenino",
  phone: "70012345",
  email: "lucia@example.com",
  objective: "Control nutricional",
  weight: 68.5,
  height: 164,
  status: "Activo",
};

test("create validates and delegates the patient to its repository", async () => {
  let received;
  const service = new PatientService({
    findDuplicate: async () => null,
    create: async (user, patient) => {
      received = { user, patient };
      return { id: "4bd49bf1-95f7-4762-a3c5-cdd064812d31" };
    },
  });
  const result = await service.create(actor, validPatient);
  assert.equal(received.user.id, 4);
  assert.equal(received.patient.names, "Lucía");
  assert.equal(received.patient.weight, undefined);
  assert.ok(result.id);
});

test("create rejects duplicate administrative identity", async () => {
  const service = new PatientService({ findDuplicate: async () => ({ id: "existing" }) });
  await assert.rejects(
    () => service.create(actor, validPatient),
    (error) => error.status === 409 && error.code === "PATIENT_DUPLICATE",
  );
});

test("paged listing preserves a cursor response", async () => {
  const page = { items: [{ id: "one" }], nextCursor: "next" };
  const service = new PatientService({ list: async () => page });
  assert.deepEqual(await service.list(actor, { limit: 10, paged: true }), page);
});

test("history creation reports a missing patient", async () => {
  const service = new PatientService({ addHistory: async () => null });
  await assert.rejects(
    () => service.addHistory(
      actor,
      "4bd49bf1-95f7-4762-a3c5-cdd064812d31",
      { type: "administrative_note", notes: "Documentación pendiente" },
    ),
    (error) => error.status === 404,
  );
});

test("rejects clinical notes in the administrative patient history", async () => {
  const service = new PatientService({ addHistory: async () => ({ id: "unexpected" }) });
  await assert.rejects(
    () => service.addHistory(
      actor,
      "4bd49bf1-95f7-4762-a3c5-cdd064812d31",
      { type: "Control", notes: "Seguimiento clínico" },
    ),
    (error) => error.name === "ZodError",
  );
});
