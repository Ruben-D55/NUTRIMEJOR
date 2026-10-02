import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { open, readFile, rm, stat } from "node:fs/promises";
import { finished, pipeline } from "node:stream/promises";

const MAGIC = Buffer.from("NMBK01", "ascii");
const IV_BYTES = 12;
const TAG_BYTES = 16;

function keyFromEnvironment() {
  const encoded = process.env.BACKUP_ENCRYPTION_KEY;
  if (!encoded) throw new Error("BACKUP_ENCRYPTION_KEY no está configurada.");
  const key = Buffer.from(encoded, "base64url");
  if (key.length !== 32) throw new Error("BACKUP_ENCRYPTION_KEY debe contener 32 bytes en Base64URL.");
  return key;
}

async function encrypt(input, output, key) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const destination = createWriteStream(output, { flags: "wx", mode: 0o600 });
  destination.write(Buffer.concat([MAGIC, iv]));
  try {
    await pipeline(createReadStream(input), cipher, destination, { end: false });
    destination.end(cipher.getAuthTag());
    await finished(destination);
  } catch (error) {
    destination.destroy();
    await rm(output, { force: true });
    throw error;
  }
}

async function decrypt(input, output, key) {
  const metadata = await stat(input);
  const headerBytes = MAGIC.length + IV_BYTES;
  if (metadata.size <= headerBytes + TAG_BYTES) throw new Error("El respaldo cifrado está incompleto.");
  const handle = await open(input, "r");
  const header = Buffer.alloc(headerBytes);
  const tag = Buffer.alloc(TAG_BYTES);
  try {
    await handle.read(header, 0, header.length, 0);
    await handle.read(tag, 0, tag.length, metadata.size - TAG_BYTES);
  } finally {
    await handle.close();
  }
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Formato de respaldo cifrado desconocido.");
  const iv = header.subarray(MAGIC.length);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    await pipeline(
      createReadStream(input, { start: headerBytes, end: metadata.size - TAG_BYTES - 1 }),
      decipher,
      createWriteStream(output, { flags: "wx", mode: 0o600 }),
    );
  } catch (error) {
    await rm(output, { force: true });
    throw new Error(`No se pudo autenticar o descifrar el respaldo: ${error.message}`);
  }
}

async function digest(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function sign(path, signaturePath, key) {
  const hmac = createHmac("sha256", key);
  for await (const chunk of createReadStream(path)) hmac.update(chunk);
  const destination = createWriteStream(signaturePath, { flags: "wx", mode: 0o600 });
  destination.end(`${hmac.digest("hex")}\n`);
  await finished(destination);
}

async function verify(path, signaturePath, key) {
  const hmac = createHmac("sha256", key);
  for await (const chunk of createReadStream(path)) hmac.update(chunk);
  const expected = Buffer.from(hmac.digest("hex"), "ascii");
  const actual = Buffer.from((await readFile(signaturePath, "utf8")).trim(), "ascii");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error("La firma del manifiesto no es válida.");
  }
}

const [operation, input, output] = process.argv.slice(2);
if (!operation || !input || !output) {
  throw new Error("Uso: node backup-crypto.mjs <encrypt|decrypt|digest|sign|verify> <entrada> <salida>.");
}
const key = operation === "digest" ? null : keyFromEnvironment();
if (operation === "encrypt") await encrypt(input, output, key);
else if (operation === "decrypt") await decrypt(input, output, key);
else if (operation === "digest") process.stdout.write(`${await digest(input)}\n`);
else if (operation === "sign") await sign(input, output, key);
else if (operation === "verify") await verify(input, output, key);
else throw new Error(`Operación desconocida: ${operation}`);
