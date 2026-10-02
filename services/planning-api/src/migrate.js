import { migrateDatabase, rollbackDatabase } from "./infrastructure/sql/database.js";

const down = process.argv.includes("--down");
const stepsArgument = process.argv.find((argument) => argument.startsWith("--steps="));
const steps = stepsArgument ? Number.parseInt(stepsArgument.split("=")[1], 10) : 1;
if (down) {
  await rollbackDatabase(steps);
  console.log(`Database rollback completed (${steps} step(s)).`);
} else {
  await migrateDatabase();
  console.log("Database migrations completed.");
}
