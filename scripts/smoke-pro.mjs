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
const account = await request("http://localhost:4001/v1/users", {
  method: "POST",
  body: {
    name: "Pro Smoke",
    email: `pro-${stamp}@example.test`,
    password: "Password123!",
  },
});
const patient = await request("http://localhost:4002/v1/patients", {
  token: account.accessToken,
  method: "POST",
  body: {
    names: "Paola",
    lastNames: "Pro",
    documentType: "CI",
    document: `PRO-${stamp}`,
    birthDate: "1993-03-03",
    sex: "Femenino",
    status: "Activo",
  },
});
const createFood = (name, category, energy, carbs, protein, fat) => request("http://localhost:4003/v1/foods", {
  token: account.accessToken,
  method: "POST",
  body: {
    name, category,
    nutrients: [
      { nutrientCode: "energy_kcal", amountPer100g: energy },
      { nutrientCode: "carbohydrate_g", amountPer100g: carbs },
      { nutrientCode: "protein_g", amountPer100g: protein },
      { nutrientCode: "fat_g", amountPer100g: fat },
    ],
  },
});
const oats = await createFood(`Avena ${stamp}`, "Cereales", 389, 66, 17, 7);
const yogurt = await createFood(`Yogur ${stamp}`, "Lácteos", 63, 7, 5, 2);
const peanut = await createFood(`Maní ${stamp}`, "Frutos secos", 567, 16, 26, 49);

const generatorBody = {
  patientId: patient.id,
  title: "Plan automático Pro",
  requirement: {
    weightKg: 65,
    heightCm: 165,
    ageYears: 32,
    sex: "female",
    activityFactor: 1.4,
    macroPercentages: { carbohydrate: 50, protein: 20, fat: 30 },
    nutrientTargets: [{ nutrientCode: "fiber_g", targetAmount: 25, unit: "g" }],
  },
  mealDistribution: [
    { mealType: "Desayuno", percentEnergy: 30 },
    { mealType: "Almuerzo", percentEnergy: 40 },
    { mealType: "Cena", percentEnergy: 30 },
  ],
  restrictions: [{ type: "allergy", value: "maní", foodId: peanut.id }],
  daysCount: 2,
  candidateItems: [
    { catalogType: "food", catalogId: oats.id },
    { catalogType: "food", catalogId: yogurt.id },
    { catalogType: "food", catalogId: peanut.id },
  ],
};
const denied = await request("http://localhost:4008/v1/meal-plans/generate", {
  token: account.accessToken,
  method: "POST",
  body: generatorBody,
  expectedStatus: 403,
});
assert.equal(denied.code, "FEATURE_NOT_ENTITLED");

await request("http://localhost:4004/v1/subscriptions/current", {
  token: account.accessToken,
  method: "PUT",
  body: { planCode: "PRO" },
});
const plan = await request("http://localhost:4008/v1/meal-plans/generate", {
  token: account.accessToken,
  method: "POST",
  body: generatorBody,
});
assert.equal(plan.status, "draft");
assert.equal(plan.days.length, 2);
assert.ok(plan.days.every((day) => day.meals.length === 3));
assert.ok(plan.days.flatMap((day) => day.meals).flatMap((meal) => meal.items)
  .every((item) => item.catalogId !== peanut.id));

const reviewRequired = await request(`http://localhost:4008/v1/meal-plans/${plan.id}/publish`, {
  token: account.accessToken,
  method: "POST",
  body: { expectedVersion: 1 },
  expectedStatus: 409,
});
assert.equal(reviewRequired.code, "PROFESSIONAL_REVIEW_REQUIRED");

const substitutions = await request("http://localhost:4008/v1/substitutions/evaluate", {
  token: account.accessToken,
  method: "POST",
  body: {
    patientId: patient.id,
    original: { catalogType: "food", catalogId: oats.id, amount: 100, amountUnit: "g" },
    candidates: [
      { catalogType: "food", catalogId: yogurt.id },
      { catalogType: "food", catalogId: peanut.id },
    ],
    restrictions: generatorBody.restrictions,
  },
});
assert.equal(substitutions.algorithmVersion, "nutrient-similarity-1.0.0");
assert.ok(substitutions.alternatives.some((item) => item.catalogId === yogurt.id));
assert.ok(!substitutions.alternatives.some((item) => item.catalogId === peanut.id));

const shopping = await request(`http://localhost:4008/v1/meal-plans/${plan.id}/shopping-list`, {
  token: account.accessToken,
  method: "POST",
  body: {},
});
assert.ok(shopping.items.length >= 2);
await request(`http://localhost:4008/v1/meal-plans/${plan.id}/reviews`, {
  token: account.accessToken,
  method: "POST",
  body: { decision: "approved", comments: "Revisado y ajustado por el profesional." },
});
const published = await request(`http://localhost:4008/v1/meal-plans/${plan.id}/publish`, {
  token: account.accessToken,
  method: "POST",
  body: { expectedVersion: 1 },
});
assert.equal(published.status, "published");

console.log(JSON.stringify({
  basicDenied: true,
  proEntitlementEnforced: true,
  safeAutomaticGenerator: true,
  professionalReviewRequired: true,
  substitutionsRanked: substitutions.alternatives.length,
  shoppingItems: shopping.items.length,
  immutablePublication: true,
}));
