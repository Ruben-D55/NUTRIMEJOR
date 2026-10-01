import assert from "node:assert/strict";
import test from "node:test";
import { RecordService } from "../src/application/record-service.js";

const patientId = "f58e9c5e-8ff6-44d7-b16a-c22de422da99";
const foodId = "4bd49bf1-95f7-4762-a3c5-cdd064812d31";

test("creates a validated evaluación nutricional", async () => {
  let received;
  const repository = { create: async (actor, input) => ((received = { actor, input }), { id: "ok" }) };
  const catalogs = {
    getFood: async () => ({
      id: foodId,
      name: "Avena",
      category: "Cereales",
      version: 2,
      nutrients: [{ nutrientCode: "energy_kcal", nutrientName: "Energía", unit: "kcal", amountPer100g: 380 }],
    }),
  };
  const service = new RecordService(repository, catalogs);
  const actor = { id: 7 };
  const result = await service.create(actor, {
    patientId,
    title: "Registro válido",
    recall24h: {
      date: "2026-09-24",
      meals: [{ mealType: "Desayuno", items: [{ foodId, amountGrams: 50 }] }],
    },
  });
  assert.equal(result.id, "ok");
  assert.equal(received.actor.id, 7);
  assert.equal(received.input.analysis.totals[0].amount, 190);
  assert.equal(received.input.recall24h.meals[0].items[0].foodSnapshot.version, 2);
});

test("assistants cannot access nutrition assessments", () => {
  const service = new RecordService({ list: async () => [] });
  assert.throws(
    () => service.list({ id: 7, organizationRole: "ASSISTANT" }),
    (error) => error.status === 403 && error.code === "NUTRITION_ACCESS_FORBIDDEN",
  );
});

test("completion reports optimistic concurrency conflicts", async () => {
  const service = new RecordService({ complete: async () => ({ error: "conflict" }) });
  await assert.rejects(
    () => service.complete({ id: 7 }, "65b9593a-f609-47ac-8b9c-c82ed29fe771", { expectedVersion: 2 }),
    (error) => error.status === 409,
  );
});

test("rejects an invalid patient id", () => {
  const service = new RecordService({ list: async () => [] });
  assert.throws(() => service.list({ id: 7 }, "invalid"));
});
