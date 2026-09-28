import assert from "node:assert/strict";

const serviceKey = process.env.SERVICE_API_KEY || "local-service-key-change-me-1234";
const local = (url) => url.replace("http://localhost:", "http://127.0.0.1:");
async function request(url, { token, method = "GET", body, expectedStatus } = {}) {
  const response = await fetch(local(url), {
    method,
    headers: {
      "x-service-key": serviceKey,
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
  body: { name: "Sport Smoke", email: `sport-${stamp}@example.test`, password: "Password123!" },
});
const patient = await request("http://localhost:4002/v1/patients", {
  token: account.accessToken,
  method: "POST",
  body: {
    names: "Elena", lastNames: "Atleta", documentType: "CI",
    document: `SPORT-${stamp}`, birthDate: "1998-07-15", sex: "Femenino", status: "Activo",
  },
});
const denied = await request("http://localhost:4006/v1/sport/evaluators", {
  token: account.accessToken,
  method: "POST",
  body: { displayName: "Evaluador Sport", isakLevel: 2, accreditationCode: `ISAK-${stamp}` },
  expectedStatus: 403,
});
assert.equal(denied.code, "FEATURE_NOT_ENTITLED");
await request("http://localhost:4004/v1/subscriptions/current", {
  token: account.accessToken,
  method: "PUT",
  body: { planCode: "SPORT" },
});
const evaluator = await request("http://localhost:4006/v1/sport/evaluators", {
  token: account.accessToken,
  method: "POST",
  body: { displayName: "Evaluador Sport", isakLevel: 2, accreditationCode: `ISAK-${stamp}` },
});

const assessmentBody = (assessedAt, delta = 0) => ({
  patientId: patient.id,
  evaluatorId: evaluator.id,
  protocolCode: "ISAK_2",
  sport: "Atletismo",
  trainingPhase: "Preparación",
  assessedAt,
  ageYears: 28,
  sex: "female",
  measurements: [
    { category: "skinfold", code: "triceps", value: 16 - delta, unit: "mm", side: "right", equipment: "Plicómetro calibrado" },
    { category: "skinfold", code: "suprailiac", value: 18 - delta, unit: "mm", side: "right", equipment: "Plicómetro calibrado" },
    { category: "skinfold", code: "thigh", value: 22 - delta, unit: "mm", side: "right", equipment: "Plicómetro calibrado" },
    { category: "diameter", code: "humerus", value: 6.4, unit: "cm", side: "right", equipment: "Paquímetro" },
    { category: "circumference", code: "calf", value: 35, unit: "cm", side: "right", equipment: "Cinta antropométrica" },
  ],
  hydration: {
    preWeightKg: 60,
    postWeightKg: 59.4 + delta * 0.05,
    fluidIntakeLiters: 0.5,
    urineLiters: 0,
    durationMinutes: 90,
  },
});
const first = await request("http://localhost:4006/v1/sport/assessments", {
  token: account.accessToken,
  method: "POST",
  body: assessmentBody("2026-06-01T14:00:00.000Z", 0),
});
const second = await request("http://localhost:4006/v1/sport/assessments", {
  token: account.accessToken,
  method: "POST",
  body: assessmentBody("2026-09-01T14:00:00.000Z", 2),
});
assert.equal(first.protocolCode, "ISAK_2");
assert.equal(first.evaluatorIsakLevel, 2);
assert.ok(first.calculations.some((item) => item.formulaCode === "JACKSON_POLLOCK_3_FEMALE"));
assert.ok(first.calculations.some((item) => item.formulaCode === "SWEAT_RATE"));
const comparison = await request(`http://localhost:4006/v1/sport/patients/${patient.id}/comparison`, {
  token: account.accessToken,
});
assert.ok(comparison.some((item) => item.metric === "JACKSON_POLLOCK_3_FEMALE"));
assert.ok(comparison.some((item) => item.metric === "skinfold:triceps:right" && item.direction === "decrease"));

const food = await request("http://localhost:4003/v1/foods", {
  token: account.accessToken,
  method: "POST",
  body: {
    name: `Bebida deportiva ${stamp}`, category: "Deporte",
    nutrients: [
      { nutrientCode: "energy_kcal", amountPer100g: 80 },
      { nutrientCode: "carbohydrate_g", amountPer100g: 20 },
      { nutrientCode: "protein_g", amountPer100g: 0 },
      { nutrientCode: "fat_g", amountPer100g: 0 },
    ],
  },
});
const sportPlan = await request("http://localhost:4008/v1/sport/meal-plans/generate", {
  token: account.accessToken,
  method: "POST",
  body: {
    patientId: patient.id,
    title: "Plan Sport",
    requirement: {
      weightKg: 60, heightCm: 168, ageYears: 28, sex: "female", activityFactor: 1.8,
      macroPercentages: { carbohydrate: 55, protein: 20, fat: 25 },
    },
    mealDistribution: [
      { mealType: "pre_training", percentEnergy: 25 },
      { mealType: "intra_training", percentEnergy: 20 },
      { mealType: "post_training", percentEnergy: 55 },
    ],
    daysCount: 1,
    candidateItems: [{ catalogType: "food", catalogId: food.id }],
  },
});
assert.equal(sportPlan.days[0].meals.length, 3);
assert.ok(sportPlan.days[0].meals.some((meal) => meal.mealType === "intra_training"));

console.log(JSON.stringify({
  sportEntitlementEnforced: true,
  isakProtocols: ["ISAK_1", "ISAK_2"],
  evaluatorTraceability: evaluator.accreditationCode,
  sportMeasurements: second.measurements.length,
  formulas: first.calculations.map((item) => `${item.formulaCode}@${item.formulaVersion}`),
  initialCurrentComparison: true,
  sportMealGenerator: true,
  isak3DisabledPendingDefinition: true,
}));
