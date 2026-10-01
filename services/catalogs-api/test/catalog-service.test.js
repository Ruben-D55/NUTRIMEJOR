import test from "node:test";
import assert from "node:assert/strict";
import { CatalogService } from "../src/application/catalog-service.js";

const actor = { id: 4, role: "NUTRICIONISTA" };

test("catalogs accept only owned domain types", async () => {
  const service = new CatalogService({ list: async () => [] });
  assert.throws(() => service.list(actor, "usuarios"));
  assert.deepEqual(await service.list(actor, "recetas"), []);
});

test("update returns not found when ownership does not match", async () => {
  const service = new CatalogService({ update: async () => false });
  await assert.rejects(
    () => service.update(actor, "alimentos", "4bd49bf1-95f7-4762-a3c5-cdd064812d31", {
      name: "Avena",
      description: "Porción de referencia",
      calories: 380,
      extra: "100 g",
    }),
    (error) => error.status === 404,
  );
});

test("creates a structured food with nutrients and portions", async () => {
  let received;
  const service = new CatalogService({
    createFood: async (requestActor, input) => ((received = { requestActor, input }), { id: "food" }),
  });
  const result = await service.createFood(actor, {
    name: "Avena",
    category: "Cereales",
    nutrients: [{ nutrientCode: "energy_kcal", amountPer100g: 380 }],
    portions: [{ name: "1 taza", grams: 80 }],
  });
  assert.equal(result.id, "food");
  assert.equal(received.input.scope, "PROFESSIONAL");
  assert.equal(received.input.nutrients[0].amountPer100g, 380);
});

test("a recipe requires versionable ingredients", async () => {
  const service = new CatalogService({ createRecipe: async () => ({}) });
  await assert.rejects(() => service.createRecipe(actor, {
    name: "Desayuno",
    instructions: "Mezclar y servir",
    category: "Desayuno",
    servings: 1,
    ingredients: [],
  }));
});

test("copies a visible food without accepting a global mutation", async () => {
  const service = new CatalogService({ copyFood: async (_actor, id) => ({ id: "copy", sourceId: id }) });
  const result = await service.copyFood(actor, "4bd49bf1-95f7-4762-a3c5-cdd064812d31");
  assert.equal(result.id, "copy");
});
