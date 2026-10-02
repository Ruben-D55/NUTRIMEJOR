import assert from "node:assert/strict";
import { gatewayUrl } from "./gateway-url.mjs";

process.loadEnvFile?.();

async function request(url, { token, method = "GET", body, expectedStatus } = {}) {
  url = gatewayUrl(url);
  const response = await fetch(url, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : undefined;
  if (expectedStatus !== undefined) {
    assert.equal(response.status, expectedStatus, `${method} ${url}: ${text}`);
    return payload;
  }
  assert.ok(response.ok, `${method} ${url}: ${response.status} ${text}`);
  return payload;
}

const stamp = Date.now();
const register = (suffix) => request("http://localhost:4001/v1/users", {
  method: "POST",
  body: {
    name: `Planning Smoke ${suffix}`,
    email: `planning-${suffix}-${stamp}@example.test`,
    password: "Password123!",
  },
});
const [organizationA, organizationB] = await Promise.all([register("a"), register("b")]);

const patient = await request("http://localhost:4002/v1/patients", {
  token: organizationA.accessToken,
  method: "POST",
  body: {
    names: "Mario",
    lastNames: "Flores",
    documentType: "CI",
    document: `PLANNING-${stamp}`,
    birthDate: "1990-05-20",
    sex: "Masculino",
    status: "Activo",
  },
});

const createFood = (name, category, energy, carbs, protein, fat) => request("http://localhost:4003/v1/foods", {
  token: organizationA.accessToken,
  method: "POST",
  body: {
    name,
    category,
    nutrients: [
      { nutrientCode: "energy_kcal", amountPer100g: energy },
      { nutrientCode: "carbohydrate_g", amountPer100g: carbs },
      { nutrientCode: "protein_g", amountPer100g: protein },
      { nutrientCode: "fat_g", amountPer100g: fat },
    ],
  },
});
const rice = await createFood(`Arroz ${stamp}`, "Cereales", 130, 28, 2.7, 0.3);
const chicken = await createFood(`Pollo ${stamp}`, "Carnes", 165, 0, 31, 3.6);
const peanut = await createFood(`Maní ${stamp}`, "Frutos secos", 567, 16, 26, 49);

const recipe = await request("http://localhost:4003/v1/recipes", {
  token: organizationA.accessToken,
  method: "POST",
  body: {
    name: `Arroz con pollo ${stamp}`,
    instructions: "Cocinar y mezclar.",
    category: "Almuerzo",
    servings: 2,
    tags: ["almuerzo"],
    ingredients: [
      { foodId: rice.id, amountGrams: 200 },
      { foodId: chicken.id, amountGrams: 200 },
    ],
  },
});

const requirement = {
  weightKg: 70,
  heightCm: 175,
  ageYears: 30,
  sex: "male",
  activityFactor: 1.2,
  thermicEffectPercent: 10,
  macroPercentages: { carbohydrate: 50, protein: 20, fat: 30 },
  nutrientTargets: [{ nutrientCode: "fiber_g", targetAmount: 30, unit: "g" }],
};
const basePlan = {
  patientId: patient.id,
  title: "Plan semanal",
  validFrom: "2026-10-01",
  validTo: "2026-10-07",
  requirement,
  mealDistribution: [
    { mealType: "Desayuno", percentEnergy: 30 },
    { mealType: "Almuerzo", percentEnergy: 40 },
    { mealType: "Cena", percentEnergy: 30 },
  ],
  restrictions: [{ type: "allergy", value: "maní", foodId: peanut.id }],
};

const forbidden = await request("http://localhost:4008/v1/meal-plans", {
  token: organizationA.accessToken,
  method: "POST",
  body: {
    ...basePlan,
    title: "Plan contraindicado",
    days: [{
      label: "Día 1",
      meals: [{
        mealType: "Desayuno",
        items: [{ catalogType: "food", catalogId: peanut.id, amount: 30, amountUnit: "g" }],
      }],
    }],
  },
  expectedStatus: 422,
});
assert.equal(forbidden.code, "PLAN_RESTRICTION_VIOLATION");

const plan = await request("http://localhost:4008/v1/meal-plans", {
  token: organizationA.accessToken,
  method: "POST",
  body: {
    ...basePlan,
    days: [{
      date: "2026-10-01",
      label: "Día 1",
      meals: [
        {
          mealType: "Desayuno",
          time: "07:30",
          items: [{ catalogType: "food", catalogId: rice.id, amount: 150, amountUnit: "g" }],
        },
        {
          mealType: "Almuerzo",
          time: "13:00",
          items: [{ catalogType: "recipe", catalogId: recipe.id, amount: 1, amountUnit: "serving" }],
        },
      ],
    }],
  },
});
assert.equal(plan.status, "draft");
assert.equal(plan.requirement.energy.formulaCode, "MIFFLIN_ST_JEOR");
assert.equal(plan.requirement.energy.formulaVersion, "1.0.0");
assert.equal(plan.requirement.energy.totalEnergy, 2176.35);
assert.equal(plan.mealDistribution.length, 3);
assert.equal(plan.days[0].analysis.calculationVersion, "menu-adequacy-1.0.0");
assert.ok(plan.days[0].analysis.adequacy.some((item) => item.nutrientCode === "energy_kcal"));

const originalEnergy = plan.days[0].analysis.totals.find((item) => item.nutrientCode === "energy_kcal").amount;
await request(`http://localhost:4003/v1/foods/${rice.id}/nutrients`, {
  token: organizationA.accessToken,
  method: "PUT",
  body: { expectedVersion: 1, nutrients: [{ nutrientCode: "energy_kcal", amountPer100g: 999 }] },
});
const stablePlan = await request(`http://localhost:4008/v1/meal-plans/${plan.id}`, {
  token: organizationA.accessToken,
});
assert.equal(
  stablePlan.days[0].analysis.totals.find((item) => item.nutrientCode === "energy_kcal").amount,
  originalEnergy,
);

const published = await request(`http://localhost:4008/v1/meal-plans/${plan.id}/publish`, {
  token: organizationA.accessToken,
  method: "POST",
  body: { expectedVersion: 1 },
});
assert.equal(published.status, "published");
const versions = await request(`http://localhost:4008/v1/meal-plans/${plan.id}/versions`, {
  token: organizationA.accessToken,
});
assert.equal(versions.length, 1);
assert.equal(versions[0].snapshot.status, "published");
await request(`http://localhost:4008/v1/meal-plans/${plan.id}/publish`, {
  token: organizationA.accessToken,
  method: "POST",
  body: { expectedVersion: 1 },
  expectedStatus: 409,
});
await request(`http://localhost:4008/v1/meal-plans/${plan.id}`, {
  token: organizationB.accessToken,
  expectedStatus: 404,
});

console.log(JSON.stringify({
  reproducibleEnergy: `${plan.requirement.energy.formulaCode}@${plan.requirement.energy.formulaVersion}`,
  totalEnergy: plan.requirement.energy.totalEnergy,
  macroTargets: plan.requirement.macros.length,
  mealDistribution: plan.mealDistribution.length,
  menuDays: plan.days.length,
  catalogSnapshotsStable: true,
  adequacyCalculated: true,
  hardRestrictions: true,
  immutablePublishedPlan: true,
  organizationIsolation: true,
}));
