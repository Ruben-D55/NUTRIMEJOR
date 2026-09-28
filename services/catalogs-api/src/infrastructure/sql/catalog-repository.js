import { database, sql } from "./database.js";

function requestFor(pool, actor) {
  return pool.request()
    .input("ownerId", sql.Int, actor.id)
    .input("organizationId", sql.UniqueIdentifier, actor.organizationId);
}

function canManageOrganization(actor) {
  return ["OWNER", "ADMIN"].includes(actor.organizationRole);
}

function json(value, fallback = []) {
  try {
    return JSON.parse(value || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

const visibility = `(Scope='GLOBAL' OR (
  IdOrganizacion=@organizationId AND
  (Scope='ORGANIZATION' OR (Scope='PROFESSIONAL' AND IdNutricionista=@ownerId))
))`;

const mutable = `IdOrganizacion=@organizationId AND (
  (Scope='PROFESSIONAL' AND IdNutricionista=@ownerId)
  OR (Scope='ORGANIZATION' AND @canManage=1)
)`;

export class SqlCatalogRepository {
  async list(actor, type) {
    const pool = await database();
    const result = await requestFor(pool, actor)
      .input("type", sql.VarChar(20), type)
      .query(`SELECT IdCatalogo id, Nombre name, Descripcion description,
                     Calorias calories, Extra extra
              FROM Catalogos
              WHERE Tipo=@type AND IdOrganizacion=@organizationId
              ORDER BY FechaActualizacion DESC`);
    return result.recordset;
  }

  async create(actor, type, item) {
    const pool = await database();
    const result = await requestFor(pool, actor)
      .input("type", sql.VarChar(20), type)
      .input("name", sql.NVarChar(150), item.name)
      .input("description", sql.NVarChar(1000), item.description || null)
      .input("calories", sql.Decimal(9, 2), item.calories)
      .input("extra", sql.NVarChar(250), item.extra || null)
      .query(`INSERT INTO Catalogos
                (IdOrganizacion, IdNutricionista, Tipo, Nombre, Descripcion, Calorias, Extra)
              OUTPUT INSERTED.IdCatalogo id
              VALUES (@organizationId, @ownerId, @type, @name, @description, @calories, @extra)`);
    return result.recordset[0];
  }

  async update(actor, type, id, item) {
    const pool = await database();
    const result = await requestFor(pool, actor)
      .input("type", sql.VarChar(20), type)
      .input("id", sql.UniqueIdentifier, id)
      .input("name", sql.NVarChar(150), item.name)
      .input("description", sql.NVarChar(1000), item.description || null)
      .input("calories", sql.Decimal(9, 2), item.calories)
      .input("extra", sql.NVarChar(250), item.extra || null)
      .query(`UPDATE Catalogos SET Nombre=@name, Descripcion=@description,
                     Calorias=@calories, Extra=@extra, FechaActualizacion=SYSUTCDATETIME()
              WHERE IdCatalogo=@id AND Tipo=@type AND IdOrganizacion=@organizationId;
              SELECT @@ROWCOUNT affected;`);
    return result.recordset[0].affected > 0;
  }

  async remove(actor, type, id) {
    const pool = await database();
    const result = await requestFor(pool, actor)
      .input("type", sql.VarChar(20), type)
      .input("id", sql.UniqueIdentifier, id)
      .query(`DELETE FROM Catalogos
              WHERE IdCatalogo=@id AND Tipo=@type AND IdOrganizacion=@organizationId;
              SELECT @@ROWCOUNT affected;`);
    return result.recordset[0].affected > 0;
  }

  async listNutrients() {
    const pool = await database();
    const result = await pool.request().query(`SELECT IdNutrient AS id, Code AS code, Name AS name,
      Unit AS unit, NutrientGroup AS nutrientGroup, DecimalPlaces AS decimalPlaces,
      Version AS version FROM Nutrients WHERE Active=1 ORDER BY NutrientGroup, Name`);
    return result.recordset;
  }

  async listFoods(actor, filters) {
    const pool = await database();
    const request = requestFor(pool, actor);
    let where = `${visibility} AND Active=1`;
    if (filters.search) {
      request.input("search", sql.NVarChar(202), `%${filters.search}%`);
      where += " AND (Name LIKE @search OR Description LIKE @search OR Brand LIKE @search)";
    }
    if (filters.category) {
      request.input("category", sql.NVarChar(120), filters.category);
      where += " AND Category=@category";
    }
    if (filters.scope) {
      request.input("scope", sql.VarChar(20), filters.scope);
      where += " AND Scope=@scope";
    }
    const result = await request.query(`SELECT IdFood AS id, Scope AS scope, Name AS name,
      Category AS category, Description AS description, Brand AS brand,
      SourceName AS sourceName, SourceReference AS sourceReference, LicenseName AS licenseName,
      Version AS version, CreatedAt AS createdAt, UpdatedAt AS updatedAt
      FROM Foods WHERE ${where} ORDER BY Name`);
    return result.recordset;
  }

  async getFood(actor, id) {
    const pool = await database();
    const base = await requestFor(pool, actor)
      .input("id", sql.UniqueIdentifier, id)
      .query(`SELECT IdFood AS id, Scope AS scope, Name AS name, Category AS category,
                     Description AS description, Brand AS brand, SourceName AS sourceName,
                     SourceReference AS sourceReference, LicenseName AS licenseName,
                     Version AS version, CreatedAt AS createdAt, UpdatedAt AS updatedAt
              FROM Foods WHERE IdFood=@id AND Active=1 AND ${visibility}`);
    const food = base.recordset[0];
    if (!food) return null;
    const [nutrients, portions] = await Promise.all([
      pool.request().input("id", sql.UniqueIdentifier, id).query(`
        SELECT nutrients.IdNutrient AS nutrientId, nutrients.Code AS nutrientCode,
               nutrients.Name AS nutrientName, nutrients.Unit AS unit,
               valuesTable.AmountPer100g AS amountPer100g,
               valuesTable.SourceReference AS sourceReference
        FROM FoodNutrients valuesTable
        JOIN Nutrients nutrients ON nutrients.IdNutrient=valuesTable.IdNutrient
        WHERE valuesTable.IdFood=@id ORDER BY nutrients.NutrientGroup, nutrients.Name`),
      pool.request().input("id", sql.UniqueIdentifier, id).query(`
        SELECT portions.IdFoodPortion AS id, portions.Name AS name, portions.Grams AS grams,
               portions.IdHouseholdMeasure AS householdMeasureId,
               measures.Name AS householdMeasure, measures.Abbreviation AS abbreviation,
               portions.Version AS version
        FROM FoodPortions portions
        LEFT JOIN HouseholdMeasures measures
          ON measures.IdHouseholdMeasure=portions.IdHouseholdMeasure
        WHERE portions.IdFood=@id ORDER BY portions.Name`),
    ]);
    return { ...food, nutrients: nutrients.recordset, portions: portions.recordset };
  }

  async createFood(actor, input) {
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const id = await this.insertFood(transaction, actor, input);
      await transaction.commit();
      return this.getFood(actor, id);
    } catch (error) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw error;
    }
  }

  async updateFood(actor, id, input) {
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const updated = await new sql.Request(transaction)
        .input("ownerId", sql.Int, actor.id)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("canManage", sql.Bit, canManageOrganization(actor))
        .input("id", sql.UniqueIdentifier, id)
        .input("name", sql.NVarChar(200), input.name)
        .input("category", sql.NVarChar(120), input.category)
        .input("description", sql.NVarChar(1000), input.description)
        .input("brand", sql.NVarChar(160), input.brand)
        .input("sourceName", sql.NVarChar(240), input.sourceName)
        .input("sourceReference", sql.NVarChar(500), input.sourceReference)
        .input("licenseName", sql.NVarChar(240), input.licenseName)
        .query(`UPDATE Foods SET Name=@name, Category=@category, Description=@description,
                       Brand=@brand, SourceName=@sourceName, SourceReference=@sourceReference,
                       LicenseName=@licenseName, Version=Version+1, UpdatedAt=SYSUTCDATETIME()
                WHERE IdFood=@id AND ${mutable};
                SELECT @@ROWCOUNT affected;`);
      if (!updated.recordset[0].affected) {
        await transaction.rollback();
        return null;
      }
      await this.replaceFoodNutrientsInTransaction(transaction, id, input.nutrients);
      await transaction.commit();
      return this.getFood(actor, id);
    } catch (error) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw error;
    }
  }

  async copyFood(actor, id) {
    const source = await this.getFood(actor, id);
    if (!source) return null;
    return this.createFood(actor, {
      name: `${source.name} (copia)`,
      category: source.category,
      description: source.description,
      brand: source.brand,
      scope: "PROFESSIONAL",
      sourceName: source.sourceName,
      sourceReference: source.sourceReference,
      licenseName: source.licenseName,
      nutrients: source.nutrients.map((item) => ({
        nutrientCode: item.nutrientCode,
        amountPer100g: Number(item.amountPer100g),
        sourceReference: item.sourceReference,
      })),
      portions: source.portions.map((item) => ({
        name: item.name,
        grams: Number(item.grams),
        householdMeasureId: null,
      })),
    });
  }

  async replaceFoodNutrients(actor, id, input) {
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const updated = await new sql.Request(transaction)
        .input("ownerId", sql.Int, actor.id)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("canManage", sql.Bit, canManageOrganization(actor))
        .input("id", sql.UniqueIdentifier, id)
        .input("expectedVersion", sql.Int, input.expectedVersion)
        .query(`UPDATE Foods SET Version=Version+1, UpdatedAt=SYSUTCDATETIME()
                WHERE IdFood=@id AND Version=@expectedVersion AND ${mutable};
                SELECT @@ROWCOUNT affected;`);
      if (!updated.recordset[0].affected) {
        await transaction.rollback();
        return null;
      }
      await this.replaceFoodNutrientsInTransaction(transaction, id, input.nutrients);
      await transaction.commit();
      return this.getFood(actor, id);
    } catch (error) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw error;
    }
  }

  async addFoodPortion(actor, id, input) {
    const pool = await database();
    const mutableFood = await requestFor(pool, actor)
      .input("canManage", sql.Bit, canManageOrganization(actor))
      .input("id", sql.UniqueIdentifier, id)
      .query(`SELECT IdFood FROM Foods WHERE IdFood=@id AND Active=1 AND ${mutable}`);
    if (!mutableFood.recordset[0]) return null;
    const result = await pool.request()
      .input("foodId", sql.UniqueIdentifier, id)
      .input("measureId", sql.UniqueIdentifier, input.householdMeasureId)
      .input("name", sql.NVarChar(120), input.name)
      .input("grams", sql.Decimal(18, 6), input.grams)
      .query(`INSERT INTO FoodPortions (IdFood, IdHouseholdMeasure, Name, Grams)
              OUTPUT INSERTED.IdFoodPortion AS id, INSERTED.Name AS name,
                     INSERTED.Grams AS grams, INSERTED.Version AS version
              VALUES (@foodId, @measureId, @name, @grams)`);
    return result.recordset[0];
  }

  async createHouseholdMeasure(actor, input) {
    const pool = await database();
    const result = await requestFor(pool, actor)
      .input("name", sql.NVarChar(120), input.name)
      .input("abbreviation", sql.NVarChar(30), input.abbreviation)
      .query(`INSERT INTO HouseholdMeasures (IdOrganizacion, IdNutricionista, Name, Abbreviation)
              OUTPUT INSERTED.IdHouseholdMeasure AS id, INSERTED.Name AS name,
                     INSERTED.Abbreviation AS abbreviation
              VALUES (@organizationId, @ownerId, @name, @abbreviation)`);
    return result.recordset[0];
  }

  async insertFood(transaction, actor, input) {
    const inserted = await new sql.Request(transaction)
      .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
      .input("ownerId", sql.Int, actor.id)
      .input("scope", sql.VarChar(20), input.scope)
      .input("name", sql.NVarChar(200), input.name)
      .input("category", sql.NVarChar(120), input.category)
      .input("description", sql.NVarChar(1000), input.description)
      .input("brand", sql.NVarChar(160), input.brand)
      .input("sourceName", sql.NVarChar(240), input.sourceName)
      .input("sourceReference", sql.NVarChar(500), input.sourceReference)
      .input("licenseName", sql.NVarChar(240), input.licenseName)
      .query(`INSERT INTO Foods
                (IdOrganizacion, IdNutricionista, Scope, Name, Category, Description,
                 Brand, SourceName, SourceReference, LicenseName)
              OUTPUT INSERTED.IdFood AS id
              VALUES (@organizationId,
                      CASE WHEN @scope='PROFESSIONAL' THEN @ownerId ELSE NULL END,
                      @scope, @name, @category, @description, @brand,
                      @sourceName, @sourceReference, @licenseName)`);
    const id = inserted.recordset[0].id;
    await this.replaceFoodNutrientsInTransaction(transaction, id, input.nutrients);
    for (const portion of input.portions) {
      await new sql.Request(transaction)
        .input("foodId", sql.UniqueIdentifier, id)
        .input("measureId", sql.UniqueIdentifier, portion.householdMeasureId)
        .input("name", sql.NVarChar(120), portion.name)
        .input("grams", sql.Decimal(18, 6), portion.grams)
        .query(`INSERT INTO FoodPortions (IdFood, IdHouseholdMeasure, Name, Grams)
                VALUES (@foodId, @measureId, @name, @grams)`);
    }
    return id;
  }

  async replaceFoodNutrientsInTransaction(transaction, foodId, nutrients) {
    await new sql.Request(transaction)
      .input("foodId", sql.UniqueIdentifier, foodId)
      .query("DELETE FROM FoodNutrients WHERE IdFood=@foodId");
    for (const nutrient of nutrients) {
      const inserted = await new sql.Request(transaction)
        .input("foodId", sql.UniqueIdentifier, foodId)
        .input("code", sql.VarChar(80), nutrient.nutrientCode)
        .input("amount", sql.Decimal(18, 6), nutrient.amountPer100g)
        .input("sourceReference", sql.NVarChar(500), nutrient.sourceReference)
        .query(`INSERT INTO FoodNutrients (IdFood, IdNutrient, AmountPer100g, SourceReference)
                SELECT @foodId, IdNutrient, @amount, @sourceReference
                FROM Nutrients WHERE Code=@code AND Active=1;
                SELECT @@ROWCOUNT affected;`);
      if (!inserted.recordset[0].affected) throw new Error(`Nutriente desconocido: ${nutrient.nutrientCode}`);
    }
  }

  async listRecipes(actor, search) {
    const pool = await database();
    const request = requestFor(pool, actor);
    let filter = "";
    if (search) {
      request.input("search", sql.NVarChar(202), `%${search}%`);
      filter = " AND (Name LIKE @search OR Description LIKE @search OR Category LIKE @search)";
    }
    const result = await request.query(`SELECT IdRecipe AS id, Scope AS scope, Name AS name,
      Description AS description, Category AS category, Servings AS servings,
      Version AS version, UpdatedAt AS updatedAt
      FROM Recipes WHERE Active=1 AND ${visibility}${filter} ORDER BY Name`);
    return result.recordset;
  }

  async getRecipe(actor, id) {
    const pool = await database();
    const base = await requestFor(pool, actor)
      .input("id", sql.UniqueIdentifier, id)
      .query(`SELECT IdRecipe AS id, Scope AS scope, Name AS name, Description AS description,
                     PhotoPath AS photoPath, Instructions AS instructions,
                     PreparationMinutes AS preparationMinutes, Category AS category,
                     Servings AS servings, YieldGrams AS yieldGrams, Version AS version,
                     CreatedAt AS createdAt, UpdatedAt AS updatedAt
              FROM Recipes WHERE IdRecipe=@id AND Active=1 AND ${visibility}`);
    const recipe = base.recordset[0];
    if (!recipe) return null;
    const [ingredients, nutrients, tags] = await Promise.all([
      pool.request().input("id", sql.UniqueIdentifier, id).query(`
        SELECT IdRecipeIngredient AS id, IdFood AS foodId, AmountGrams AS amountGrams,
               FoodVersion AS foodVersion, FoodSnapshot AS foodSnapshot,
               Notes AS notes, Position AS position
        FROM RecipeIngredients WHERE IdRecipe=@id ORDER BY Position`),
      pool.request().input("id", sql.UniqueIdentifier, id).query(`
        SELECT nutrients.Code AS nutrientCode, nutrients.Name AS nutrientName,
               nutrients.Unit AS unit, valuesTable.TotalAmount AS totalAmount,
               valuesTable.AmountPerServing AS amountPerServing,
               valuesTable.CalculationVersion AS calculationVersion,
               valuesTable.InputsSnapshot AS inputsSnapshot,
               valuesTable.CalculatedAt AS calculatedAt
        FROM RecipeNutrients valuesTable
        JOIN Nutrients nutrients ON nutrients.IdNutrient=valuesTable.IdNutrient
        WHERE valuesTable.IdRecipe=@id ORDER BY nutrients.NutrientGroup, nutrients.Name`),
      pool.request().input("id", sql.UniqueIdentifier, id).query(`
        SELECT tags.IdCatalogTag AS id, tags.Name AS name FROM RecipeTags relation
        JOIN CatalogTags tags ON tags.IdCatalogTag=relation.IdCatalogTag
        WHERE relation.IdRecipe=@id ORDER BY tags.Name`),
    ]);
    return {
      ...recipe,
      ingredients: ingredients.recordset.map((item) => ({ ...item, foodSnapshot: json(item.foodSnapshot, {}) })),
      nutrients: nutrients.recordset.map((item) => ({ ...item, inputsSnapshot: json(item.inputsSnapshot) })),
      tags: tags.recordset,
    };
  }

  async createRecipe(actor, input) {
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const inserted = await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("ownerId", sql.Int, actor.id)
        .input("scope", sql.VarChar(20), input.scope)
        .input("name", sql.NVarChar(200), input.name)
        .input("description", sql.NVarChar(1000), input.description)
        .input("photoPath", sql.NVarChar(500), input.photoPath)
        .input("instructions", sql.NVarChar(sql.MAX), input.instructions)
        .input("minutes", sql.Int, input.preparationMinutes)
        .input("category", sql.NVarChar(120), input.category)
        .input("servings", sql.Decimal(10, 2), input.servings)
        .input("yieldGrams", sql.Decimal(18, 6), input.yieldGrams)
        .query(`INSERT INTO Recipes
                  (IdOrganizacion, IdNutricionista, Scope, Name, Description, PhotoPath,
                   Instructions, PreparationMinutes, Category, Servings, YieldGrams)
                OUTPUT INSERTED.IdRecipe AS id
                VALUES (@organizationId,
                        CASE WHEN @scope='PROFESSIONAL' THEN @ownerId ELSE NULL END,
                        @scope, @name, @description, @photoPath, @instructions,
                        @minutes, @category, @servings, @yieldGrams)`);
      const id = inserted.recordset[0].id;
      const populated = await this.populateRecipe(transaction, actor, id, input);
      if (!populated) {
        await transaction.rollback();
        return null;
      }
      await transaction.commit();
      return this.getRecipe(actor, id);
    } catch (error) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw error;
    }
  }

  async updateRecipe(actor, id, input) {
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const updated = await new sql.Request(transaction)
        .input("ownerId", sql.Int, actor.id)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("canManage", sql.Bit, canManageOrganization(actor))
        .input("id", sql.UniqueIdentifier, id)
        .input("name", sql.NVarChar(200), input.name)
        .input("description", sql.NVarChar(1000), input.description)
        .input("photoPath", sql.NVarChar(500), input.photoPath)
        .input("instructions", sql.NVarChar(sql.MAX), input.instructions)
        .input("minutes", sql.Int, input.preparationMinutes)
        .input("category", sql.NVarChar(120), input.category)
        .input("servings", sql.Decimal(10, 2), input.servings)
        .input("yieldGrams", sql.Decimal(18, 6), input.yieldGrams)
        .query(`UPDATE Recipes SET Name=@name, Description=@description, PhotoPath=@photoPath,
                       Instructions=@instructions, PreparationMinutes=@minutes,
                       Category=@category, Servings=@servings, YieldGrams=@yieldGrams,
                       Version=Version+1, UpdatedAt=SYSUTCDATETIME()
                WHERE IdRecipe=@id AND ${mutable};
                SELECT @@ROWCOUNT affected;`);
      if (!updated.recordset[0].affected) {
        await transaction.rollback();
        return null;
      }
      await new sql.Request(transaction).input("id", sql.UniqueIdentifier, id)
        .query(`DELETE FROM RecipeNutrients WHERE IdRecipe=@id;
                DELETE FROM RecipeIngredients WHERE IdRecipe=@id;
                DELETE FROM RecipeTags WHERE IdRecipe=@id;`);
      const populated = await this.populateRecipe(transaction, actor, id, input);
      if (!populated) {
        await transaction.rollback();
        return null;
      }
      await transaction.commit();
      return this.getRecipe(actor, id);
    } catch (error) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw error;
    }
  }

  async copyRecipe(actor, id) {
    const source = await this.getRecipe(actor, id);
    if (!source) return null;
    return this.createRecipe(actor, {
      name: `${source.name} (copia)`,
      description: source.description,
      photoPath: source.photoPath,
      instructions: source.instructions,
      preparationMinutes: source.preparationMinutes,
      category: source.category,
      servings: Number(source.servings),
      yieldGrams: source.yieldGrams === null ? null : Number(source.yieldGrams),
      scope: "PROFESSIONAL",
      tags: source.tags.map((item) => item.name),
      ingredients: source.ingredients.map((item) => ({
        foodId: item.foodId,
        amountGrams: Number(item.amountGrams),
        notes: item.notes,
      })),
    });
  }

  async populateRecipe(transaction, actor, recipeId, input) {
    const totals = new Map();
    const snapshots = [];
    for (let position = 0; position < input.ingredients.length; position += 1) {
      const ingredient = input.ingredients[position];
      const foodResult = await new sql.Request(transaction)
        .input("ownerId", sql.Int, actor.id)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("foodId", sql.UniqueIdentifier, ingredient.foodId)
        .query(`SELECT IdFood AS id, Name AS name, Version AS version, Category AS category
                FROM Foods WHERE IdFood=@foodId AND Active=1 AND ${visibility}`);
      const food = foodResult.recordset[0];
      if (!food) return false;
      const nutrientResult = await new sql.Request(transaction)
        .input("foodId", sql.UniqueIdentifier, ingredient.foodId)
        .query(`SELECT valuesTable.IdNutrient AS nutrientId, nutrients.Code AS code,
                       nutrients.Unit AS unit, valuesTable.AmountPer100g AS amountPer100g
                FROM FoodNutrients valuesTable
                JOIN Nutrients nutrients ON nutrients.IdNutrient=valuesTable.IdNutrient
                WHERE valuesTable.IdFood=@foodId`);
      const snapshot = {
        id: food.id,
        name: food.name,
        category: food.category,
        version: food.version,
        nutrients: nutrientResult.recordset,
      };
      snapshots.push({ amountGrams: ingredient.amountGrams, food: snapshot });
      await new sql.Request(transaction)
        .input("recipeId", sql.UniqueIdentifier, recipeId)
        .input("foodId", sql.UniqueIdentifier, ingredient.foodId)
        .input("amount", sql.Decimal(18, 6), ingredient.amountGrams)
        .input("foodVersion", sql.Int, food.version)
        .input("snapshot", sql.NVarChar(sql.MAX), JSON.stringify(snapshot))
        .input("notes", sql.NVarChar(300), ingredient.notes)
        .input("position", sql.Int, position)
        .query(`INSERT INTO RecipeIngredients
                  (IdRecipe, IdFood, AmountGrams, FoodVersion, FoodSnapshot, Notes, Position)
                VALUES (@recipeId, @foodId, @amount, @foodVersion, @snapshot, @notes, @position)`);
      for (const nutrient of nutrientResult.recordset) {
        const amount = Number(nutrient.amountPer100g) * ingredient.amountGrams / 100;
        const current = totals.get(String(nutrient.nutrientId)) || { ...nutrient, total: 0 };
        current.total += amount;
        totals.set(String(nutrient.nutrientId), current);
      }
    }
    for (const nutrient of totals.values()) {
      await new sql.Request(transaction)
        .input("recipeId", sql.UniqueIdentifier, recipeId)
        .input("nutrientId", sql.UniqueIdentifier, nutrient.nutrientId)
        .input("total", sql.Decimal(18, 6), nutrient.total)
        .input("perServing", sql.Decimal(18, 6), nutrient.total / input.servings)
        .input("inputs", sql.NVarChar(sql.MAX), JSON.stringify(snapshots))
        .query(`INSERT INTO RecipeNutrients
                  (IdRecipe, IdNutrient, TotalAmount, AmountPerServing,
                   CalculationVersion, InputsSnapshot)
                VALUES (@recipeId, @nutrientId, @total, @perServing,
                        'recipe-nutrients-1.0.0', @inputs)`);
    }
    for (const tag of [...new Set(input.tags.map((item) => item.toLocaleLowerCase("es")))]) {
      const tagResult = await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .input("name", sql.NVarChar(100), tag)
        .query(`DECLARE @tagId UNIQUEIDENTIFIER;
                SELECT @tagId=IdCatalogTag FROM CatalogTags WITH (UPDLOCK, HOLDLOCK)
                WHERE IdOrganizacion=@organizationId AND Name=@name;
                IF @tagId IS NULL
                BEGIN
                  SET @tagId=NEWID();
                  INSERT INTO CatalogTags (IdCatalogTag, IdOrganizacion, Name)
                  VALUES (@tagId, @organizationId, @name);
                END;
                SELECT @tagId AS id;`);
      await new sql.Request(transaction)
        .input("recipeId", sql.UniqueIdentifier, recipeId)
        .input("tagId", sql.UniqueIdentifier, tagResult.recordset[0].id)
        .query("INSERT INTO RecipeTags (IdRecipe, IdCatalogTag) VALUES (@recipeId, @tagId)");
    }
    return true;
  }

  async listRecommendations(actor) {
    const pool = await database();
    const result = await requestFor(pool, actor).query(`SELECT IdRecommendation AS id,
      Category AS category, Title AS title, Content AS content, Tags AS tags,
      CreatedAt AS createdAt, UpdatedAt AS updatedAt
      FROM Recommendations WHERE IdOrganizacion=@organizationId AND Active=1
      ORDER BY Category, Title`);
    return result.recordset.map((item) => ({ ...item, tags: json(item.tags) }));
  }

  async createRecommendation(actor, input) {
    const pool = await database();
    const result = await requestFor(pool, actor)
      .input("category", sql.NVarChar(120), input.category)
      .input("title", sql.NVarChar(200), input.title)
      .input("content", sql.NVarChar(sql.MAX), input.content)
      .input("tags", sql.NVarChar(sql.MAX), JSON.stringify(input.tags))
      .query(`INSERT INTO Recommendations
                (IdOrganizacion, IdNutricionista, Category, Title, Content, Tags)
              OUTPUT INSERTED.IdRecommendation AS id, INSERTED.Title AS title
              VALUES (@organizationId, @ownerId, @category, @title, @content, @tags)`);
    return result.recordset[0];
  }

  async listEducation(actor) {
    const pool = await database();
    const result = await requestFor(pool, actor).query(`SELECT IdEducationResource AS id,
      ResourceType AS resourceType, Title AS title, Description AS description,
      StoragePath AS storagePath, Tags AS tags, CreatedAt AS createdAt
      FROM EducationResources WHERE IdOrganizacion=@organizationId AND Active=1
      ORDER BY Title`);
    return result.recordset.map((item) => ({ ...item, tags: json(item.tags) }));
  }

  async createEducation(actor, input) {
    const pool = await database();
    const result = await requestFor(pool, actor)
      .input("resourceType", sql.VarChar(30), input.resourceType)
      .input("title", sql.NVarChar(200), input.title)
      .input("description", sql.NVarChar(1000), input.description)
      .input("storagePath", sql.NVarChar(500), input.storagePath)
      .input("tags", sql.NVarChar(sql.MAX), JSON.stringify(input.tags))
      .query(`INSERT INTO EducationResources
                (IdOrganizacion, IdNutricionista, ResourceType, Title,
                 Description, StoragePath, Tags)
              OUTPUT INSERTED.IdEducationResource AS id, INSERTED.Title AS title
              VALUES (@organizationId, @ownerId, @resourceType, @title,
                      @description, @storagePath, @tags)`);
    return result.recordset[0];
  }

  async migrateLegacy(actor) {
    const pool = await database();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const pending = await new sql.Request(transaction)
        .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
        .query(`SELECT legacy.* FROM Catalogos legacy
                LEFT JOIN LegacyCatalogImports imported ON imported.IdCatalogo=legacy.IdCatalogo
                WHERE legacy.IdOrganizacion=@organizationId AND imported.IdCatalogo IS NULL`);
      let foods = 0;
      let references = 0;
      for (const legacy of pending.recordset) {
        let targetId;
        let targetType;
        if (legacy.Tipo === "alimentos") {
          const food = await this.insertFood(transaction, actor, {
            name: legacy.Nombre,
            category: "legacy",
            description: legacy.Descripcion,
            brand: null,
            scope: "PROFESSIONAL",
            sourceName: "NUTRIMEJOR legacy catalog",
            sourceReference: String(legacy.IdCatalogo),
            licenseName: null,
            nutrients: [{
              nutrientCode: "energy_kcal",
              amountPer100g: Number(legacy.Calorias),
              sourceReference: "Valor heredado; verificar porción",
            }],
            portions: [],
          });
          targetId = food;
          targetType = "food";
          foods += 1;
        } else {
          const reference = await new sql.Request(transaction)
            .input("organizationId", sql.UniqueIdentifier, actor.organizationId)
            .input("ownerId", sql.Int, actor.id)
            .input("category", sql.NVarChar(120), `legacy_${legacy.Tipo}`)
            .input("title", sql.NVarChar(200), legacy.Nombre)
            .input("content", sql.NVarChar(sql.MAX), [legacy.Descripcion, legacy.Extra].filter(Boolean).join("\n"))
            .query(`INSERT INTO Recommendations
                      (IdOrganizacion, IdNutricionista, Category, Title, Content)
                    OUTPUT INSERTED.IdRecommendation AS id
                    VALUES (@organizationId, @ownerId, @category, @title, @content)`);
          targetId = reference.recordset[0].id;
          targetType = "reference";
          references += 1;
        }
        await new sql.Request(transaction)
          .input("legacyId", sql.UniqueIdentifier, legacy.IdCatalogo)
          .input("targetType", sql.VarChar(30), targetType)
          .input("targetId", sql.UniqueIdentifier, targetId)
          .query(`INSERT INTO LegacyCatalogImports (IdCatalogo, TargetType, TargetId)
                  VALUES (@legacyId, @targetType, @targetId)`);
      }
      await transaction.commit();
      return { migrated: pending.recordset.length, foods, references };
    } catch (error) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw error;
    }
  }
}
