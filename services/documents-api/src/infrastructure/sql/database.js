import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import sql from "mssql";
import { config } from "../../config.js";

let poolPromise;

const connection = (database) => ({
  server: config.db.server,
  port: config.db.port,
  database,
  user: config.db.user,
  password: config.db.password,
  options: { encrypt: config.db.encrypt, trustServerCertificate: config.db.trustServerCertificate },
  pool: config.db.pool,
});

async function connect(database, attempts = 30) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await new sql.ConnectionPool(connection(database)).connect();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw lastError;
}

async function migrate(pool) {
  await pool.request().query(`IF OBJECT_ID('SchemaMigrations', 'U') IS NULL
    CREATE TABLE SchemaMigrations (
      FileName NVARCHAR(255) PRIMARY KEY,
      Checksum CHAR(64) NOT NULL,
      AppliedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    )`);
  const directory = new URL("../../../database/", import.meta.url);
  const files = (await readdir(directory)).filter((file) => /^\d+.*\.sql$/i.test(file)).sort();
  for (const file of files) {
    const migration = await readFile(new URL(file, directory), "utf8");
    const checksum = createHash("sha256").update(migration).digest("hex");
    const applied = await pool.request()
      .input("file", sql.NVarChar(255), file)
      .query("SELECT Checksum AS checksum FROM SchemaMigrations WHERE FileName=@file");
    if (applied.recordset[0]) {
      if (applied.recordset[0].checksum !== checksum) {
        throw new Error(`La migración aplicada ${file} cambió de contenido.`);
      }
      continue;
    }
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      await new sql.Request(transaction).batch(migration);
      await new sql.Request(transaction)
        .input("file", sql.NVarChar(255), file)
        .input("checksum", sql.Char(64), checksum)
        .query("INSERT INTO SchemaMigrations (FileName, Checksum) VALUES (@file, @checksum)");
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

export async function migrateDatabase() {
  const pool = await initialize(true);
  await pool.close();
}

export async function ready() {
  const pool = await database();
  await pool.request().query("SELECT 1 AS ok");
}

export { sql };
