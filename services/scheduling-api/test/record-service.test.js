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
