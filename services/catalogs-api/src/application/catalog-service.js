import { z } from "zod";
import { notFound } from "../domain/errors.js";

const typeSchema = z.enum(["recetas", "alimentos", "dietas"]);
const idSchema = z.string().uuid();
const scopeSchema = z.enum(["ORGANIZATION", "PROFESSIONAL"]);
const itemSchema = z.object({
  name: z.string().trim().min(2).max(150),
  description: z.string().trim().max(1000).default(""),
  calories: z.coerce.number().min(0).max(9999999),
  extra: z.string().trim().max(250).default(""),
});

const foodSchema = z.object({
  name: z.string().trim().min(2).max(200),
  category: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).nullable().optional().default(null),
  brand: z.string().trim().max(160).nullable().optional().default(null),
  scope: scopeSchema.optional().default("PROFESSIONAL"),
  sourceName: z.string().trim().max(240).nullable().optional().default(null),
  sourceReference: z.string().trim().max(500).nullable().optional().default(null),
  licenseName: z.string().trim().max(240).nullable().optional().default(null),
  nutrients: z.array(z.object({
    nutrientCode: z.string().trim().min(1).max(80),
    amountPer100g: z.number().finite().min(0),
    sourceReference: z.string().trim().max(500).nullable().optional().default(null),
  })).max(200).optional().default([]),
  portions: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    grams: z.number().positive().max(100000),
    householdMeasureId: z.string().uuid().nullable().optional().default(null),
  })).max(100).optional().default([]),
});

const foodNutrientsSchema = z.object({
  nutrients: foodSchema.shape.nutrients,
  expectedVersion: z.number().int().positive(),
});

const portionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  grams: z.number().positive().max(100000),
  householdMeasureId: z.string().uuid().nullable().optional().default(null),
});

const householdMeasureSchema = z.object({
  name: z.string().trim().min(1).max(120),
  abbreviation: z.string().trim().max(30).nullable().optional().default(null),
});

const ingredientSchema = z.object({
  foodId: z.string().uuid(),
  amountGrams: z.number().positive().max(100000),
  notes: z.string().trim().max(300).nullable().optional().default(null),
});

const recipeSchema = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(1000).nullable().optional().default(null),
  photoPath: z.string().trim().max(500).nullable().optional().default(null),
  instructions: z.string().trim().min(3).max(20000),
  preparationMinutes: z.number().int().positive().max(10000).nullable().optional().default(null),
  category: z.string().trim().min(2).max(120),
  servings: z.number().positive().max(10000),
  yieldGrams: z.number().positive().max(1000000).nullable().optional().default(null),
  scope: scopeSchema.optional().default("PROFESSIONAL"),
  tags: z.array(z.string().trim().min(1).max(100)).max(50).optional().default([]),
  ingredients: z.array(ingredientSchema).min(1).max(300),
});

const recommendationSchema = z.object({
  category: z.string().trim().min(2).max(120),
  title: z.string().trim().min(2).max(200),
  content: z.string().trim().min(3).max(20000),
  tags: z.array(z.string().trim().min(1).max(100)).max(50).optional().default([]),
});

const educationSchema = z.object({
  resourceType: z.enum(["pdf", "image", "infographic", "guide", "other"]),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(1000).nullable().optional().default(null),
  storagePath: z.string().trim().min(1).max(500),
  tags: z.array(z.string().trim().min(1).max(100)).max(50).optional().default([]),
});

export class CatalogService {
  constructor(repository) {
    this.repository = repository;
  }

  list(actor, type) {
    return this.repository.list(actor, typeSchema.parse(type));
  }

  create(actor, type, input) {
    return this.repository.create(actor, typeSchema.parse(type), itemSchema.parse(input));
  }

  async update(actor, type, id, input) {
    const updated = await this.repository.update(
      actor,
      typeSchema.parse(type),
      idSchema.parse(id),
      itemSchema.parse(input),
    );
    if (!updated) throw notFound();
    return { ok: true };
  }

  async remove(actor, type, id) {
    const removed = await this.repository.remove(actor, typeSchema.parse(type), idSchema.parse(id));
    if (!removed) throw notFound();
  }

  listNutrients(actor) {
    return this.repository.listNutrients(actor);
  }

  listFoods(actor, filters = {}) {
    return this.repository.listFoods(actor, {
      search: z.string().trim().max(200).optional().parse(filters.search) || null,
      category: z.string().trim().max(120).optional().parse(filters.category) || null,
      scope: z.enum(["GLOBAL", "ORGANIZATION", "PROFESSIONAL"]).optional().parse(filters.scope) || null,
    });
  }

  async getFood(actor, id) {
    const item = await this.repository.getFood(actor, idSchema.parse(id));
    if (!item) throw notFound();
    return item;
  }

  createFood(actor, input) {
    return this.repository.createFood(actor, foodSchema.parse(input));
  }

  async updateFood(actor, id, input) {
    const item = await this.repository.updateFood(actor, idSchema.parse(id), foodSchema.parse(input));
    if (!item) throw notFound();
    return item;
  }

  async copyFood(actor, id) {
    const item = await this.repository.copyFood(actor, idSchema.parse(id));
    if (!item) throw notFound();
    return item;
  }

  async replaceFoodNutrients(actor, id, input) {
    const item = await this.repository.replaceFoodNutrients(
      actor,
      idSchema.parse(id),
      foodNutrientsSchema.parse(input),
    );
    if (!item) throw notFound();
    return item;
  }

  async addFoodPortion(actor, id, input) {
    const item = await this.repository.addFoodPortion(actor, idSchema.parse(id), portionSchema.parse(input));
    if (!item) throw notFound();
    return item;
  }

  createHouseholdMeasure(actor, input) {
    return this.repository.createHouseholdMeasure(actor, householdMeasureSchema.parse(input));
  }

  listRecipes(actor, search) {
    return this.repository.listRecipes(actor, z.string().trim().max(200).optional().parse(search) || null);
  }

  async getRecipe(actor, id) {
    const item = await this.repository.getRecipe(actor, idSchema.parse(id));
    if (!item) throw notFound();
    return item;
  }

  async createRecipe(actor, input) {
    const item = await this.repository.createRecipe(actor, recipeSchema.parse(input));
    if (!item) throw notFound("Uno de los alimentos no existe o no es visible.");
    return item;
  }

  async updateRecipe(actor, id, input) {
    const item = await this.repository.updateRecipe(actor, idSchema.parse(id), recipeSchema.parse(input));
    if (!item) throw notFound();
    return item;
  }

  async copyRecipe(actor, id) {
    const item = await this.repository.copyRecipe(actor, idSchema.parse(id));
    if (!item) throw notFound();
    return item;
  }

  listRecommendations(actor) {
    return this.repository.listRecommendations(actor);
  }

  createRecommendation(actor, input) {
    return this.repository.createRecommendation(actor, recommendationSchema.parse(input));
  }

  listEducation(actor) {
    return this.repository.listEducation(actor);
  }

  createEducation(actor, input) {
    return this.repository.createEducation(actor, educationSchema.parse(input));
  }

  migrateLegacy(actor) {
    return this.repository.migrateLegacy(actor);
  }
}
