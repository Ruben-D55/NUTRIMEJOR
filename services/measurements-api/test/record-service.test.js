import assert from "node:assert/strict";
import test from "node:test";
import { RecordService } from "../src/application/record-service.js";

const patientId = "f58e9c5e-8ff6-44d7-b16a-c22de422da99";

test("creates a validated sesión de medición", async () => {
  let received;
  const repository = { create: async (actor, input) => ((received = { actor, input }), { id: "ok" }) };
  const service = new RecordService(repository);
  const actor = { id: 7 };
  const result = await service.create(actor, {
    patientId,
    title: "Registro válido",
    measurements: [
      { type: "weight", value: 70, unit: "kg" },
      { type: "height", value: 175, unit: "cm" },
    ],
  });
  assert.equal(result.id, "ok");
  assert.equal(received.actor.id, 7);
  assert.equal(received.input.calculations[0].formulaCode, "BMI");
  assert.equal(received.input.calculations[0].result, 22.86);
});

test("rejects incompatible anthropometric units", async () => {
  const service = new RecordService({ create: async () => ({}) });
  await assert.rejects(() => service.create({ id: 7 }, {
    patientId,
    title: "Unidades inválidas",
    measurements: [{ type: "height", value: 1.75, unit: "m" }],
  }));
});

test("requires PRO entitlement for advanced anthropometry and preserves formula traceability", async () => {
  const checked = [];
  let stored;
  const service = new RecordService(
    { create: async (_actor, input) => ((stored = input), { id: "advanced" }) },
    { assert: async (organizationId, feature) => checked.push([organizationId, feature]) },
  );
  const result = await service.create({ id: 7, organizationId: patientId }, {
    patientId,
    title: "Composición corporal",
    advancedMeasurements: [
      { category: "skinfold", code: "triceps", value: 12, unit: "mm", side: "right", equipment: "Plicómetro" },
    ],
    bodyComposition: [{
      indicator: "body_fat_percent",
      value: 18.4,
      unit: "%",
      method: "Densitometría por pliegues",
      formulaCode: "CUSTOM_BODY_FAT",
      formulaVersion: "1.0.0",
      formulaSource: "Protocolo validado por la organización",
      inputs: { sumSkinfoldsMm: 42 },
    }],
  });
  assert.equal(result.id, "advanced");
  assert.deepEqual(checked, [[patientId, "measurements.advanced"]]);
  assert.equal(stored.bodyComposition[0].formulaVersion, "1.0.0");
});

test("builds absolute and percentage comparison", async () => {
  const repository = {
    comparison: async () => [{
      metric: "weight",
      unit: "kg",
      initialValue: 80,
      currentValue: 76,
      initialAt: new Date("2026-01-01"),
      currentAt: new Date("2026-02-01"),
      initialSessionId: "a",
      currentSessionId: "b",
    }],
  };
  const service = new RecordService(repository);
  const [comparison] = await service.comparison({ id: 7 }, patientId);
  assert.equal(comparison.absoluteChange, -4);
  assert.equal(comparison.percentageChange, -5);
  assert.equal(comparison.direction, "decrease");
});

test("assistants cannot access clinical measurements", () => {
  const service = new RecordService({ list: async () => [] });
  assert.throws(
    () => service.list({ id: 7, organizationRole: "ASSISTANT" }),
    (error) => error.status === 403 && error.code === "MEASUREMENTS_ACCESS_FORBIDDEN",
  );
});

test("rejects an invalid patient id", () => {
  const service = new RecordService({ list: async () => [] });
  assert.throws(() => service.list({ id: 7 }, "invalid"));
});
