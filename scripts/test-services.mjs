import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const servicesRoot = new URL("../services/", import.meta.url);
const services = (await readdir(servicesRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && (entry.name.endsWith("-api") || entry.name === "api-gateway"))
  .map((entry) => entry.name)
  .sort();

const tests = [];
for (const service of services) {
  const testDirectory = new URL(`../services/${service}/test/`, import.meta.url);
  try {
    const files = await readdir(testDirectory);
    const directoryPath = fileURLToPath(testDirectory);
    tests.push(...files.filter((file) => file.endsWith(".test.js")).map((file) => join(directoryPath, file)));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

if (!tests.length) throw new Error("No se encontraron pruebas de servicios.");

const result = spawnSync(process.execPath, ["--test", ...tests], {
  stdio: "inherit",
  shell: false,
});
process.exit(result.status ?? 1);
