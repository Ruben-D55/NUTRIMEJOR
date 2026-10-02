import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const cli = resolve("scripts/backup-crypto.mjs");

function run(args, key) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    env: { ...process.env, BACKUP_ENCRYPTION_KEY: key },
  });
}

test("cifra, autentica y descifra sin conservar texto en claro", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nutrimejor-crypto-"));
  const key = randomBytes(32).toString("base64url");
  const source = join(directory, "database.bak");
  const encrypted = `${source}.enc`;
  const restored = join(directory, "restored.bak");
  const manifest = join(directory, "manifest.json");
  const signature = join(directory, "manifest.hmac");
  const content = randomBytes(128 * 1024);
  try {
    await writeFile(source, content);
    assert.equal(run(["encrypt", source, encrypted], key).status, 0);
    assert.notDeepEqual(await readFile(encrypted), content);
    assert.equal(run(["decrypt", encrypted, restored], key).status, 0);
    assert.deepEqual(await readFile(restored), content);

    await writeFile(manifest, '{"databaseCount":12}');
    assert.equal(run(["sign", manifest, signature], key).status, 0);
    assert.equal(run(["verify", manifest, signature], key).status, 0);
    await writeFile(manifest, '{"databaseCount":11}');
    assert.notEqual(run(["verify", manifest, signature], key).status, 0);

    const tampered = await readFile(encrypted);
    tampered[Math.floor(tampered.length / 2)] ^= 1;
    await writeFile(encrypted, tampered);
    await rm(restored);
    assert.notEqual(run(["decrypt", encrypted, restored], key).status, 0);
    await assert.rejects(readFile(restored));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
