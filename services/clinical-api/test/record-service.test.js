import assert from "node:assert/strict";
import test from "node:test";
import { RecordService } from "../src/application/record-service.js";

const patientId = "f58e9c5e-8ff6-44d7-b16a-c22de422da99";

test("creates a validated consulta", async () => {
  let received;
  const repository = { create: async (actor, input) => ((received = { actor, input }), { id: "ok" }) };
  const service = new RecordService(repository);
  const actor = { id: 7 };
  const result = await service.create(actor, {
    patientId,
    title: "Registro válido",
    data: { source: "test" },
  });
  assert.equal(result.id, "ok");
  assert.equal(received.actor.id, 7);
  assert.equal(received.input.status, "draft");
  assert.equal(received.input.consultationType, "initial");
});

test("assistants cannot access clinical records", () => {
  const service = new RecordService({ list: async () => [] });
  assert.throws(
    () => service.list({ id: 7, organizationRole: "ASSISTANT" }),
    (error) => error.status === 403 && error.code === "CLINICAL_ACCESS_FORBIDDEN",
  );
});

test("publishes a consultation with optimistic concurrency", async () => {
  let received;
  const repository = {
    publish: async (actor, id, input) => ((received = { actor, id, input }), { id, status: "published" }),
  };
  const service = new RecordService(repository);
  const id = "65b9593a-f609-47ac-8b9c-c82ed29fe771";
  const result = await service.publish({ id: 7 }, id, { expectedVersion: 2 });
  assert.equal(result.status, "published");
  assert.equal(received.input.expectedVersion, 2);
  assert.equal(received.input.reason, "Publicación de la consulta");
});

test("corrections require an explicit reason", async () => {
  const service = new RecordService({ correct: async () => ({}) });
  await assert.rejects(() => service.correct(
    { id: 7 },
    "65b9593a-f609-47ac-8b9c-c82ed29fe771",
    { patientId, title: "Corrección", data: {}, expectedVersion: 1 },
  ));
});

test("rejects an invalid patient id", () => {
  const service = new RecordService({ list: async () => [] });
  assert.throws(() => service.list({ id: 7 }, "invalid"));
});

test("patients can read their own consultations but cannot write clinical data", async () => {
  const service = new RecordService({
    list: async () => [{ id: "own", patientId }],
    create: async () => ({ id: "unexpected" }),
  });
  const patientActor = { id: 12, organizationRole: "PATIENT", patientId };
  assert.equal((await service.list(patientActor, patientId))[0].id, "own");
  assert.throws(
    () => service.create(patientActor, { patientId, title: "No permitido", data: {} }),
    (error) => error.status === 403,
  );
});
