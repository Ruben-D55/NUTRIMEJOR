import assert from "node:assert/strict";
import { gatewayUrl } from "./gateway-url.mjs";

process.loadEnvFile?.();
const local = (url) => url.replace("http://localhost:", "http://127.0.0.1:");

async function request(url, { token, method = "GET", body, expectedStatus } = {}) {
  url = gatewayUrl(url);
  const response = await fetch(local(url), {
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
    name: `Nutrition Smoke ${suffix}`,
    email: `nutrition-${suffix}-${stamp}@example.test`,
    password: "Password123!",
  },
});
const [organizationA, organizationB] = await Promise.all([register("a"), register("b")]);

const patient = await request("http://localhost:4002/v1/patients", {
  token: organizationA.accessToken,
  method: "POST",
  body: {
    names: "Carla",
    lastNames: "Suárez",
    documentType: "CI",
    document: `NUTRITION-${stamp}`,
    birthDate: "1994-03-12",
    sex: "Femenino",
    status: "Activo",
  },
});

const food = await request("http://localhost:4003/v1/foods", {
  token: organizationA.accessToken,
  method: "POST",
  body: {
    name: `Alimento nutrición ${stamp}`,
    category: "Prueba",
    nutrients: [
      { nutrientCode: "energy_kcal", amountPer100g: 100 },
      { nutrientCode: "carbohydrate_g", amountPer100g: 20 },
      { nutrientCode: "protein_g", amountPer100g: 5 },
      { nutrientCode: "fat_g", amountPer100g: 1 },
      { nutrientCode: "fiber_g", amountPer100g: 3 },
      { nutrientCode: "sodium_mg", amountPer100g: 40 },
    ],
  },
});

await request("http://localhost:4004/v1/subscriptions/current", {
  token: organizationA.accessToken,
  method: "PUT",
  body: { planCode: "PRO" },
});

const assessment = await request("http://localhost:4007/v1/nutrition-assessments", {
  token: organizationA.accessToken,
  method: "POST",
  body: {
    patientId: patient.id,
    title: "Evaluación nutricional integral",
    assessmentType: "comprehensive",
    assessedAt: "2026-09-24T15:00:00.000Z",
    lifestyle: {
      dailyActivity: "Trabajo de oficina",
      workSchedule: "08:00-17:00",
      sleepHours: 7.5,
      physicalActivity: "Caminata",
      exerciseType: "Cardiovascular",
      exerciseFrequencyPerWeek: 3,
      exerciseDurationMinutes: 45,
      exerciseIntensity: "moderate",
      alcohol: "Ocasional",
      tobacco: "No",
      coffee: "1 taza diaria",
    },
    dietary: {
      mealsPerDay: 4,
      schedules: ["07:30", "12:30", "17:00", "20:30"],
      preparedBy: "Paciente",
      appetite: "Conservado",
      preferences: ["frutas"],
      allergies: ["ninguna"],
      intolerances: ["ninguna"],
      waterLiters: 1.8,
      beverages: ["agua", "café"],
      weekendChanges: "Mayor consumo fuera de casa",
    },
    recall24h: {
      date: "2026-09-23",
      notes: "Día laboral habitual",
      meals: [{
        time: "07:30",
        mealType: "Desayuno",
        items: [{
          foodId: food.id,
          amountGrams: 150,
          householdMeasure: "1 porción y media",
          preparation: "Cocido",
        }],
      }],
    },
    foodFrequency: {
      periodStart: "2026-09-01",
      periodEnd: "2026-09-24",
      entries: [
        { foodGroup: "Frutas", frequencyValue: 2, frequencyUnit: "day" },
        { foodGroup: "Verduras", frequencyValue: 5, frequencyUnit: "week" },
      ],
    },
  },
});
assert.equal(assessment.status, "draft");
assert.equal(assessment.recall24h.meals[0].items[0].foodVersion, 1);
const energy = assessment.analyses[0].totals.find((item) => item.nutrientCode === "energy_kcal");
assert.equal(energy.amount, 150);
assert.equal(assessment.analyses[0].calculationVersion, "nutrition-snapshot-1.0.0");

await request(`http://localhost:4003/v1/foods/${food.id}/nutrients`, {
  token: organizationA.accessToken,
  method: "PUT",
  body: {
    expectedVersion: 1,
    nutrients: [{ nutrientCode: "energy_kcal", amountPer100g: 999 }],
  },
});

const completed = await request(`http://localhost:4007/v1/nutrition-assessments/${assessment.id}/complete`, {
  token: organizationA.accessToken,
  method: "POST",
  body: { expectedVersion: 1 },
});
assert.equal(completed.status, "completed");
assert.equal(completed.version, 2);
assert.equal(completed.analyses[0].totals.find((item) => item.nutrientCode === "energy_kcal").amount, 150);

await request(`http://localhost:4007/v1/nutrition-assessments/${assessment.id}/complete`, {
  token: organizationA.accessToken,
  method: "POST",
  body: { expectedVersion: 2 },
  expectedStatus: 409,
});
await request(`http://localhost:4007/v1/nutrition-assessments/${assessment.id}`, {
  token: organizationB.accessToken,
  expectedStatus: 404,
});

console.log(JSON.stringify({
  lifestyleAssessment: true,
  dietaryAssessment: true,
  recallMeals: completed.recall24h.meals.length,
  recallItems: completed.recall24h.meals[0].items.length,
  foodFrequencyEntries: completed.foodFrequency.entries.length,
  nutrientTotals: completed.analyses[0].totals.length,
  sourceSnapshots: completed.analyses[0].sources.length,
  historicalAnalysisStable: true,
  completedEvent: true,
  organizationIsolation: true,
}));
