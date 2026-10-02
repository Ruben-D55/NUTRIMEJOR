import assert from "node:assert/strict";
import test from "node:test";
import { RecordService } from "../src/application/record-service.js";

test("creates a validated notificación", async () => {
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

test("stores validated patient channel preferences", async () => {
  let received;
  const delivery = {
    setPreference: async (actor, input) => ((received = { actor, input }), { id: "preference" }),
  };
  const service = new RecordService({}, delivery, { assert: async () => true });
  const result = await service.setPreference({ id: 7 }, {
    patientId: "11111111-1111-4111-8111-111111111111",
    channel: "email",
    recipient: "patient@example.test",
    reminderMinutes: 60,
  });
  assert.equal(result.id, "preference");
  assert.equal(received.input.enabled, true);
});

test("requires automation entitlement for configurable alert rules", async () => {
  const checked = [];
  let received;
  const service = new RecordService(
    {},
    { createAlertRule: async (_actor, input) => ((received = input), { id: "rule" }) },
    { assert: async (organizationId, feature) => checked.push([organizationId, feature]) },
  );
  const result = await service.createAlertRule(
    { id: 7, organizationId: "f58e9c5e-8ff6-44d7-b16a-c22de422da99" },
    {
      name: "Paciente sin seguimiento",
      ruleType: "patient_without_follow_up",
      conditions: { days: 30 },
      channels: ["in_app", "email"],
      leadMinutes: 0,
    },
  );
  assert.equal(result.id, "rule");
  assert.equal(received.conditions.days, 30);
  assert.deepEqual(checked[0], ["f58e9c5e-8ff6-44d7-b16a-c22de422da99", "notifications.automation"]);
});

test("patient only lists notifications linked to their patient record", async () => {
  const ownPatientId = "11111111-1111-4111-8111-111111111111";
  let receivedPatientId;
  const service = new RecordService({
    list: async (_actor, patientId) => ((receivedPatientId = patientId), []),
  });
  const actor = { organizationRole: "PATIENT", patientId: ownPatientId };

  await service.list(actor);
  assert.equal(receivedPatientId, ownPatientId);
  assert.throws(
    () => service.list(actor, "22222222-2222-4222-8222-222222222222"),
    (error) => error.code === "FORBIDDEN",
  );
});

test("patient cannot modify notification records", () => {
  const service = new RecordService({ create: async () => ({}) });
  assert.throws(
    () => service.create(
      { organizationRole: "PATIENT", patientId: "11111111-1111-4111-8111-111111111111" },
      { title: "Recordatorio" },
    ),
    (error) => error.code === "FORBIDDEN",
  );
});
