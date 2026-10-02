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
    name: `Catalogs Smoke ${suffix}`,
    email: `catalogs-${suffix}-${stamp}@example.test`,
    password: "Password123!",
  },
});
const [organizationA, organizationB] = await Promise.all([register("a"), register("b")]);

const nutrients = await request("http://localhost:4003/v1/nutrients", { token: organizationA.accessToken });
assert.ok(nutrients.some((item) => item.code === "energy_kcal"));
assert.ok(nutrients.some((item) => item.code === "protein_g"));

const cup = await request("http://localhost:4003/v1/household-measures", {
  token: organizationA.accessToken,
  method: "POST",
  body: { name: `Taza ${stamp}`, abbreviation: "tz" },
});

const oats = await request("http://localhost:4003/v1/foods", {
  token: organizationA.accessToken,
  method: "POST",
  body: {
    name: `Avena ${stamp}`,
    category: "Cereales",
    description: "Avena en hojuelas",
    scope: "PROFESSIONAL",
    sourceName: "Ficha profesional",
    nutrients: [
      { nutrientCode: "energy_kcal", amountPer100g: 380 },
      { nutrientCode: "carbohydrate_g", amountPer100g: 68 },
      { nutrientCode: "protein_g", amountPer100g: 13 },
      { nutrientCode: "fat_g", amountPer100g: 7 },
      { nutrientCode: "fiber_g", amountPer100g: 10 },
    ],
    portions: [{ name: "1 taza", grams: 80, householdMeasureId: cup.id }],
  },
});
assert.equal(oats.nutrients.length, 5);
assert.equal(oats.portions[0].grams, 80);

const banana = await request("http://localhost:4003/v1/foods", {
  token: organizationA.accessToken,
  method: "POST",
  body: {
    name: `Banana ${stamp}`,
    category: "Frutas",
    scope: "ORGANIZATION",
    nutrients: [
      { nutrientCode: "energy_kcal", amountPer100g: 89 },
      { nutrientCode: "carbohydrate_g", amountPer100g: 23 },
      { nutrientCode: "protein_g", amountPer100g: 1.1 },
      { nutrientCode: "fat_g", amountPer100g: 0.3 },
      { nutrientCode: "fiber_g", amountPer100g: 2.6 },
    ],
    portions: [{ name: "1 unidad", grams: 120 }],
  },
});

const recipe = await request("http://localhost:4003/v1/recipes", {
  token: organizationA.accessToken,
  method: "POST",
  body: {
    name: `Avena con banana ${stamp}`,
    description: "Desayuno de prueba",
    instructions: "Cocinar la avena y servir con banana.",
    preparationMinutes: 10,
    category: "Desayuno",
    servings: 2,
    yieldGrams: 400,
    scope: "PROFESSIONAL",
    tags: ["desayuno", "pre-entreno"],
    ingredients: [
      { foodId: oats.id, amountGrams: 80 },
      { foodId: banana.id, amountGrams: 120 },
    ],
  },
});
const recipeEnergy = recipe.nutrients.find((item) => item.nutrientCode === "energy_kcal");
assert.equal(Number(recipeEnergy.totalAmount), 410.8);
assert.equal(Number(recipeEnergy.amountPerServing), 205.4);
assert.equal(recipeEnergy.calculationVersion, "recipe-nutrients-1.0.0");
assert.equal(recipe.ingredients[0].foodVersion, 1);

await request(`http://localhost:4003/v1/foods/${oats.id}/nutrients`, {
  token: organizationA.accessToken,
  method: "PUT",
  body: {
    expectedVersion: oats.version,
    nutrients: [
      { nutrientCode: "energy_kcal", amountPer100g: 999 },
      { nutrientCode: "carbohydrate_g", amountPer100g: 68 },
    ],
  },
});
const stableRecipe = await request(`http://localhost:4003/v1/recipes/${recipe.id}`, {
  token: organizationA.accessToken,
});
assert.equal(Number(stableRecipe.nutrients.find((item) => item.nutrientCode === "energy_kcal").amountPerServing), 205.4);

const copiedFood = await request(`http://localhost:4003/v1/foods/${banana.id}/copy`, {
  token: organizationA.accessToken,
  method: "POST",
});
assert.equal(copiedFood.scope, "PROFESSIONAL");
assert.notEqual(copiedFood.id, banana.id);

const copiedRecipe = await request(`http://localhost:4003/v1/recipes/${recipe.id}/copy`, {
  token: organizationA.accessToken,
  method: "POST",
});
assert.equal(copiedRecipe.scope, "PROFESSIONAL");
assert.notEqual(copiedRecipe.id, recipe.id);

await request("http://localhost:4003/v1/recommendations", {
  token: organizationA.accessToken,
  method: "POST",
  body: {
    category: "Hidratación",
    title: "Agua diaria",
    content: "Distribuir el consumo de agua durante el día.",
    tags: ["agua"],
  },
});
await request("http://localhost:4003/v1/education-resources", {
  token: organizationA.accessToken,
  method: "POST",
  body: {
    resourceType: "guide",
    title: "Guía de porciones",
    storagePath: `/education/${stamp}/portions.pdf`,
    tags: ["porciones"],
  },
});

await request("http://localhost:4003/v1/catalogs/alimentos", {
  token: organizationA.accessToken,
  method: "POST",
  body: { name: `Legacy ${stamp}`, description: "Alimento heredado", calories: 100, extra: "100 g" },
});
const firstMigration = await request("http://localhost:4003/v1/migrations/legacy-catalogs", {
  token: organizationA.accessToken,
  method: "POST",
});
const secondMigration = await request("http://localhost:4003/v1/migrations/legacy-catalogs", {
  token: organizationA.accessToken,
  method: "POST",
});
assert.ok(firstMigration.migrated >= 1);
assert.equal(secondMigration.migrated, 0);

const isolatedFoods = await request("http://localhost:4003/v1/foods", { token: organizationB.accessToken });
assert.ok(!isolatedFoods.some((item) => item.id === oats.id));
await request(`http://localhost:4003/v1/recipes/${recipe.id}`, {
  token: organizationB.accessToken,
  expectedStatus: 404,
});

console.log(JSON.stringify({
  structuredFoods: true,
  nutrientCatalog: nutrients.length,
  householdMeasures: true,
  recipeIngredients: recipe.ingredients.length,
  recipeEnergyPerServing: Number(recipeEnergy.amountPerServing),
  versionedIngredientSnapshots: true,
  recipeStableAfterFoodChange: true,
  professionalCopies: true,
  recommendationsAndEducation: true,
  legacyMigrationIdempotent: true,
  organizationIsolation: true,
}));
