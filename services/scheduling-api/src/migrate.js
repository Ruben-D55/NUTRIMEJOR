import { migrateDatabase } from "./infrastructure/sql/database.js";

await migrateDatabase();
console.log("Database migrations completed.");
