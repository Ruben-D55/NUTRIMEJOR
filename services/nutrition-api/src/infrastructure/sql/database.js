import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import sql from "mssql";
import { config } from "../../config.js";

let poolPromise;
const connection = (database) => ({
  server: config.db.server, port: config.db.port, database, user: config.db.user, password: config.db.password,
  options: { encrypt: config.db.encrypt, trustServerCertificate: config.db.trustServerCertificate }, pool: config.db.pool,
});
const checksum = (contents) => createHash("sha256").update(contents.replace(/\r\n/g, "\n")).digest("hex");
const legacyChecksum = (contents) => createHash("sha256").update(contents).digest("hex");
const isUpMigration = (file) => /^\d+.*\.sql$/i.test(file) && !/\.down\.sql$/i.test(file);
const downFileFor = (file) => file.replace(/(?:\.up)?\.sql$/i, ".down.sql");

async function connect(database, attempts = 30) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { return await new sql.ConnectionPool(connection(database)).connect(); }
    catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw lastError;
}

async function ensureMigrationTable(pool) {
  await pool.request().query(`IF OBJECT_ID('SchemaMigrations', 'U') IS NULL
    CREATE TABLE SchemaMigrations (
      FileName NVARCHAR(255) PRIMARY KEY,
      Checksum CHAR(64) NOT NULL,
      AppliedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    )`);
}

async function migrate(pool) {
  await ensureMigrationTable(pool);
  const directory = new URL("../../../database/", import.meta.url);
  const directoryFiles = await readdir(directory);
  const fileSet = new Set(directoryFiles);
  for (const file of directoryFiles.filter(isUpMigration).sort()) {
    if (/\.up\.sql$/i.test(file) && !fileSet.has(downFileFor(file))) {
      throw new Error(`La migración reversible ${file} no tiene archivo down.`);
    }
    const migration = await readFile(new URL(file, directory), "utf8");
    const normalized = checksum(migration);
    const legacy = legacyChecksum(migration);
    const applied = await pool.request().input("file", sql.NVarChar(255), file)
      .query("SELECT Checksum AS checksum FROM SchemaMigrations WHERE FileName=@file");
    if (applied.recordset[0]) {
      if (![normalized, legacy].includes(applied.recordset[0].checksum)) {
        throw new Error(`La migración aplicada ${file} cambió de contenido.`);
      }
      continue;
    }
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      await new sql.Request(transaction).batch(migration);
      await new sql.Request(transaction).input("file", sql.NVarChar(255), file)
        .input("checksum", sql.Char(64), normalized)
        .query("INSERT INTO SchemaMigrations (FileName, Checksum) VALUES (@file, @checksum)");
      await transaction.commit();
    } catch (error) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw error;
    }
  }
}

async function rollback(pool, steps) {
  await ensureMigrationTable(pool);
  if (!Number.isInteger(steps) || steps < 1 || steps > 20) throw new Error("steps debe estar entre 1 y 20.");
  const directory = new URL("../../../database/", import.meta.url);
  const applied = await pool.request().input("steps", sql.Int, steps).query(`
    SELECT TOP (@steps) FileName AS fileName, Checksum AS checksum
    FROM SchemaMigrations ORDER BY AppliedAt DESC, FileName DESC`);
  if (applied.recordset.length < steps) throw new Error("No hay suficientes migraciones para revertir.");
  for (const row of applied.recordset) {
    const downFile = downFileFor(row.fileName);
    let downMigration;
    let upMigration;
    try {
      [downMigration, upMigration] = await Promise.all([
        readFile(new URL(downFile, directory), "utf8"), readFile(new URL(row.fileName, directory), "utf8"),
      ]);
    } catch { throw new Error(`La migración ${row.fileName} no tiene reversión disponible.`); }
    if (![checksum(upMigration), legacyChecksum(upMigration)].includes(row.checksum)) {
      throw new Error(`La migración aplicada ${row.fileName} cambió de contenido.`);
    }
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      await new sql.Request(transaction).batch(downMigration);
      await new sql.Request(transaction).input("file", sql.NVarChar(255), row.fileName)
        .query("DELETE FROM SchemaMigrations WHERE FileName=@file");
      await transaction.commit();
    } catch (error) {
      if (transaction._aborted !== true) await transaction.rollback();
      throw error;
    }
  }
}

async function initialize(runMigrations) {
  const master = await connect("master");
  await master.request().query(`IF DB_ID(N'${config.db.database}') IS NULL CREATE DATABASE [${config.db.database}]`);
  await master.close();
  const pool = await connect(config.db.database);
  if (runMigrations) await migrate(pool);
  return pool;
}

export function database() {
  const runMigrations = process.env.RUN_MIGRATIONS_ON_STARTUP !== "false";
  poolPromise ||= initialize(runMigrations);
  return poolPromise;
}
export async function migrateDatabase() { const pool = await initialize(true); await pool.close(); }
export async function rollbackDatabase(steps = 1) {
  const pool = await initialize(false);
  try { await rollback(pool, steps); } finally { await pool.close(); }
}
export async function ready() { const pool = await database(); await pool.request().query("SELECT 1 AS ok"); }
export { sql };
