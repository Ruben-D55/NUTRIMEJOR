import assert from "node:assert/strict";
import test from "node:test";
import { RecordService } from "../src/application/record-service.js";

const patientId = "f58e9c5e-8ff6-44d7-b16a-c22de422da99";
const foodId = "4bd49bf1-95f7-4762-a3c5-cdd064812d31";

function validInput() {
  return {
    patientId,
    title: "Plan válido",
    requirement: {
      weightKg: 70,
      heightCm: 175,
      ageYears: 30,
      sex: "male",
      activityFactor: 1.2,
      thermicEffectPercent: 10,
      macroPercentages: { carbohydrate: 50, protein: 20, fat: 30 },
    },
    mealDistribution: [{ mealType: "Desayuno", percentEnergy: 100 }],
    days: [{
      label: "Día 1",
      meals: [{ mealType: "Desayuno", items: [{ catalogType: "food", catalogId: foodId, amount: 200, amountUnit: "g" }] }],
    }],
  };
}

test("creates a validated plan alimentario", async () => {
  let received;
  const repository = { create: async (actor, input) => ((received = { actor, input }), { id: "ok" }) };
  const catalogs = {
    getFood: async () => ({
      id: foodId,
      name: "Avena",
      category: "Cereales",
      version: 1,
      nutrients: [{ nutrientCode: "energy_kcal", nutrientName: "Energía", unit: "kcal", amountPer100g: 100 }],
    }),
  };
  const service = new RecordService(repository, catalogs);
  const actor = { id: 7 };
  const result = await service.create(actor, validInput());
  assert.equal(result.id, "ok");
  assert.equal(received.actor.id, 7);
  assert.equal(received.input.requirements.formulaCode, "MIFFLIN_ST_JEOR");
  assert.equal(received.input.requirements.totalEnergy, 2176.35);
  assert.equal(received.input.days[0].analysis.totals[0].amount, 200);
});

test("rejects macro percentages that do not sum one hundred", async () => {
  const service = new RecordService({ create: async () => ({}) }, { getFood: async () => ({}) });
  const input = validInput();
  input.requirement.macroPercentages.fat = 20;
  await assert.rejects(() => service.create({ id: 7 }, input));
});

test("never includes a contraindicated catalog item", async () => {
  const service = new RecordService(
    { create: async () => ({}) },
    {
      getFood: async () => ({
        id: foodId,
        name: "Maní tostado",
        category: "Frutos secos",
        version: 1,
        nutrients: [],
      }),
    },
  );
  const input = validInput();
  input.restrictions = [{ type: "allergy", value: "mani" }];
  await assert.rejects(
    () => service.create({ id: 7 }, input),
    (error) => error.status === 422 && error.code === "PLAN_RESTRICTION_VIOLATION",
  );
});

test("assistants cannot access meal plans", () => {
  const service = new RecordService({ list: async () => [] });
  assert.throws(
    () => service.list({ id: 7, organizationRole: "ASSISTANT" }),
    (error) => error.status === 403 && error.code === "PLANNING_ACCESS_FORBIDDEN",
  );
});

test("rejects an invalid patient id", () => {
  const service = new RecordService({ list: async () => [] });
  assert.throws(() => service.list({ id: 7 }, "invalid"));
});
