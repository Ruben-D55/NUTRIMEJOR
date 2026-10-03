import assert from "node:assert/strict";
import test from "node:test";
import { RecordService } from "../src/application/record-service.js";

test("creates a validated documento", async () => {
  let received;
  const repository = { create: async (actor, input) => ((received = { actor, input }), { id: "ok" }) };
  const service = new RecordService(repository);
  const actor = { id: 7 };
  const result = await service.create(actor, { title: "Registro válido", data: { source: "test" } });
  assert.equal(result.id, "ok");
  assert.equal(received.actor.id, 7);
  assert.equal(received.input.status, "draft");
});

test("rejects an invalid patient id", () => {
  const service = new RecordService({ list: async () => [] });
  assert.throws(() => service.list({ id: 7 }, "invalid"));
});

test("queues a validated PDF generation request", async () => {
  let received;
  const generation = { create: async (actor, input) => ((received = { actor, input }), { id: "pdf", status: "queued" }) };
  const service = new RecordService({}, generation, { consume: async () => ({ used: 1 }) });
  const result = await service.generate({ id: 7 }, {
    patientId: "11111111-1111-4111-8111-111111111111",
    title: "Plan semanal",
    documentType: "meal_plan",
    patientDisplayName: "Ana Pérez",
    sections: [{ type: "paragraph", text: "Contenido clínico validado." }],
  });
  assert.equal(result.status, "queued");
  assert.equal(received.input.sections.length, 1);
});

test("patients cannot request a download token for another patient's PDF", async () => {
  const generation = { createAccessToken: async () => ({ token: "secret", expiresAt: new Date(), patientId: "11111111-1111-4111-8111-111111111111" }) };
  const service = new RecordService({}, generation);
  await assert.rejects(
    () => service.accessUrl(
      { id: 9, organizationRole: "PATIENT", patientId: "22222222-2222-4222-8222-222222222222" },
      "33333333-3333-4333-8333-333333333333", { expiresInMinutes: 15 }, "http://documents",
    ),
    (error) => error.status === 403,
  );
});
