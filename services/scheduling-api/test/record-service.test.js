import assert from "node:assert/strict";
import test from "node:test";
import { RecordService } from "../src/application/record-service.js";

test("creates a validated cita", async () => {
  let received;
  const repository = { create: async (actor, input) => ((received = { actor, input }), { id: "ok" }) };
  const service = new RecordService(repository);
  const actor = { id: 7 };
  const result = await service.create(actor, {
    patientId: "11111111-1111-4111-8111-111111111111",
    title: "Consulta inicial",
    type: "initial",
    startsAt: "2026-10-05T13:00:00.000Z",
    endsAt: "2026-10-05T14:00:00.000Z",
  });
  assert.equal(result.id, "ok");
  assert.equal(received.actor.id, 7);
  assert.equal(received.input.timeZone, "America/La_Paz");
});

test("rejects an invalid patient id", () => {
  const service = new RecordService({ list: async () => [] });
  assert.throws(() => service.list({ id: 7 }, { patientId: "invalid" }));
});

test("rejects overlapping appointment conflicts", async () => {
  const service = new RecordService({ create: async () => ({ conflict: true }) });
  await assert.rejects(() => service.create({ id: 7 }, {
    patientId: "11111111-1111-4111-8111-111111111111",
    title: "Consulta",
    type: "follow_up",
    startsAt: "2026-10-05T13:00:00.000Z",
    endsAt: "2026-10-05T14:00:00.000Z",
  }), /ya tiene una cita/);
});

test("enforces appointment status transitions", async () => {
  const repository = {
    get: async () => ({ id: "11111111-1111-4111-8111-111111111111", status: "completed" }),
  };
  const service = new RecordService(repository);
  await assert.rejects(() => service.changeStatus({ id: 7 }, "11111111-1111-4111-8111-111111111111", {
    status: "confirmed",
    expectedVersion: 1,
  }), /No se permite/);
});

test("allows a patient to reprogram only their own pending appointment", async () => {
  const patientId = "11111111-1111-4111-8111-111111111111";
  let received;
  const repository = {
    get: async () => ({ id: "33333333-3333-4333-8333-333333333333", patientId, status: "confirmed" }),
    reschedule: async (_actor, _id, input) => ((received = input), { id: "33333333-3333-4333-8333-333333333333", status: "scheduled" }),
  };
  const service = new RecordService(repository);
  const result = await service.reschedule(
    { id: 9, organizationRole: "PATIENT", patientId },
    "33333333-3333-4333-8333-333333333333",
    { startsAt: "2026-10-06T13:00:00.000Z", endsAt: "2026-10-06T14:00:00.000Z", reason: "Cambio laboral", expectedVersion: 2 },
  );
  assert.equal(result.status, "scheduled");
  assert.equal(received.timeZone, "America/La_Paz");
});

test("allows a patient to confirm their own scheduled appointment", async () => {
  const patientId = "11111111-1111-4111-8111-111111111111";
  const repository = {
    get: async () => ({ id: "33333333-3333-4333-8333-333333333333", patientId, status: "scheduled" }),
    changeStatus: async () => ({ id: "33333333-3333-4333-8333-333333333333", patientId, status: "confirmed" }),
  };
  const service = new RecordService(repository);
  const result = await service.changeStatus(
    { id: 9, organizationRole: "PATIENT", patientId },
    "33333333-3333-4333-8333-333333333333",
    { status: "confirmed", expectedVersion: 1 },
  );
  assert.equal(result.status, "confirmed");
});

test("rejects rescheduling completed appointments", async () => {
  const repository = { get: async () => ({ id: "33333333-3333-4333-8333-333333333333", patientId: "11111111-1111-4111-8111-111111111111", status: "completed" }) };
  const service = new RecordService(repository);
  await assert.rejects(() => service.reschedule({ id: 7 }, "33333333-3333-4333-8333-333333333333", {
    startsAt: "2026-10-06T13:00:00.000Z", endsAt: "2026-10-06T14:00:00.000Z", reason: "Cambio", expectedVersion: 1,
  }), /Solo se puede reprogramar/);
});
