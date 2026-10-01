import { config } from "./config.js";
import { IdentityService } from "./application/identity-service.js";
import { SqlUserRepository } from "./infrastructure/sql/user-repository.js";
import { database } from "./infrastructure/sql/database.js";
import { JwtService } from "./infrastructure/security/jwt-service.js";
import { PasswordHasher } from "./infrastructure/security/password-hasher.js";
import { createServer } from "./interfaces/http/server.js";

await database();

const identity = new IdentityService(
  new SqlUserRepository(),
  new PasswordHasher(),
  new JwtService(),
  { exposeDevelopmentTokens: config.exposeDevelopmentTokens },
);

createServer(identity, config, async () => {
  await (await database()).request().query("SELECT 1");
}).listen(config.port, "0.0.0.0", () => {
  console.log(`identity-api listening on ${config.port}`);
});
