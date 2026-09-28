import assert from "node:assert/strict";
import test from "node:test";
import { RecordService } from "../src/application/record-service.js";

test("creates a validated reporte", async () => {
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

test("builds organization and patient dashboards from projections", async () => {
  const projections = {
    organizationDashboard: async (_actor, from, to) => ({ from, to, series: [] }),
    patientDashboard: async (_actor, patientId) => ({ patientId, timeline: [] }),
  };
  const service = new RecordService({}, projections);
  const actor = { id: 7, organizationRole: "OWNER" };
  const organization = await service.organizationDashboard(actor, "2026-09-01", "2026-09-30");
  assert.equal(organization.from, "2026-09-01");
  const patient = await service.patientDashboard(actor, "11111111-1111-4111-8111-111111111111");
  assert.equal(patient.patientId, "11111111-1111-4111-8111-111111111111");
});

test("assistants cannot access clinical reports", () => {
  const service = new RecordService({ list: async () => [] });
  assert.throws(() => service.list({ id: 7, organizationRole: "ASSISTANT" }, null), /permisos/);
});
