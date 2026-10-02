import { randomBytes } from "node:crypto";
import { access, writeFile } from "node:fs/promises";

const target = new URL("../.env", import.meta.url);
try {
  await access(target);
  console.log(".env ya existe; no se modificó.");
  process.exit(0);
} catch {}

const secret = (bytes = 32) => randomBytes(bytes).toString("base64url");
const sqlPassword = () => `Nm_${secret(24)}_aA1!`;
const contents = `# Generado localmente. No confirmar este archivo en Git.\nSERVICE_API_KEY=${secret(48)}\nIDENTITY_DB_PASSWORD=${sqlPassword()}\nPATIENTS_DB_PASSWORD=${sqlPassword()}\nCATALOGS_DB_PASSWORD=${sqlPassword()}\nPLATFORM_DB_PASSWORD=${sqlPassword()}\nRABBITMQ_USER=nutrimejor\nRABBITMQ_PASSWORD=${secret(32)}\nJWT_ISSUER=nutrimejor-identity\nJWT_AUDIENCE=nutrimejor-services\nACCESS_TOKEN_MINUTES=10\nREFRESH_TOKEN_DAYS=7\nEXPOSE_DEVELOPMENT_TOKENS=true\nRUN_MIGRATIONS_ON_STARTUP=true\n`;
await writeFile(target, contents, { encoding: "utf8", mode: 0o600, flag: "wx" });
console.log(".env creado con secretos aleatorios.");

