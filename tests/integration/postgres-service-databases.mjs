import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

const { Pool } = pg;
const domains = [
  "identity",
  "patients",
  "catalogs",
  "subscriptions",
  "clinical",
  "measurements",
  "nutrition",
  "planning",
  "scheduling",
  "notifications",
  "documents",
  "reporting",
];

const connection = (database) => ({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 55432),
  user: process.env.PGUSER || "nutrimejor",
  password: process.env.POSTGRES_INTEGRATION_PASSWORD,
  database,
  max: 2,
  connectionTimeoutMillis: 10_000,
});

test("each service owns an isolated real PostgreSQL database", async (context) => {
  assert.ok(
    process.env.POSTGRES_INTEGRATION_PASSWORD,
    "POSTGRES_INTEGRATION_PASSWORD is required for the integration database",
  );
  const admin = new Pool(connection("postgres"));
  context.after(() => admin.end());
  let version;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      version = await admin.query("SELECT version() AS version");
      await new Promise((resolve) => setTimeout(resolve, 500));
      await admin.query("SELECT 1");
      break;
    } catch (error) {
      if (attempt === 30) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
  assert.match(version.rows[0].version, /^PostgreSQL 17\./);

  const databaseRows = await admin.query(
    "SELECT datname FROM pg_database WHERE datname LIKE 'nutrimejor_%' ORDER BY datname",
  );
  assert.deepEqual(
    databaseRows.rows.map((row) => row.datname),
    domains.map((domain) => `nutrimejor_${domain}`).sort(),
  );

  const committed = new Map();
  for (const domain of domains) {
    await context.test(domain, async () => {
      const pool = new Pool(connection(`nutrimejor_${domain}`));
      try {
        await pool.query(`CREATE TABLE IF NOT EXISTS integration_service_records (
          id UUID PRIMARY KEY,
          organization_id UUID NOT NULL,
          aggregate_type TEXT NOT NULL,
          payload JSONB NOT NULL,
          version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`);

        const rolledBackId = randomUUID();
        const transaction = await pool.connect();
        try {
          await transaction.query("BEGIN");
          await transaction.query(
            "INSERT INTO integration_service_records (id, organization_id, aggregate_type, payload) VALUES ($1, $2, $3, $4::jsonb)",
            [rolledBackId, randomUUID(), `${domain}.probe`, JSON.stringify({ domain, state: "rollback" })],
          );
          await transaction.query("ROLLBACK");
        } finally {
          transaction.release();
        }
        const rolledBack = await pool.query(
          "SELECT id FROM integration_service_records WHERE id=$1",
          [rolledBackId],
        );
        assert.equal(rolledBack.rowCount, 0);

        const id = randomUUID();
        const organizationId = randomUUID();
        const inserted = await pool.query(
          `INSERT INTO integration_service_records
            (id, organization_id, aggregate_type, payload)
           VALUES ($1, $2, $3, $4::jsonb)
           RETURNING id, organization_id, aggregate_type, payload, version`,
          [id, organizationId, `${domain}.aggregate`, JSON.stringify({ domain, active: true })],
        );
        assert.equal(inserted.rows[0].payload.domain, domain);

        const updated = await pool.query(
          `UPDATE integration_service_records
              SET payload=$2::jsonb, version=version+1
            WHERE id=$1 AND version=1
          RETURNING version, payload`,
          [id, JSON.stringify({ domain, active: true, verified: true })],
        );
        assert.equal(updated.rows[0].version, 2);
        assert.equal(updated.rows[0].payload.verified, true);
        committed.set(domain, id);
      } finally {
        await pool.end();
      }
    });
  }

  for (let index = 0; index < domains.length; index += 1) {
    const domain = domains[index];
    const otherDomain = domains[(index + 1) % domains.length];
    const pool = new Pool(connection(`nutrimejor_${otherDomain}`));
    try {
      const crossDatabase = await pool.query(
        "SELECT id FROM integration_service_records WHERE id=$1",
        [committed.get(domain)],
      );
      assert.equal(crossDatabase.rowCount, 0, `${domain} leaked data into ${otherDomain}`);
    } finally {
      await pool.end();
    }
  }
});
