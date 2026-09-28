import { config } from "./config.js";
import { CatalogService } from "./application/catalog-service.js";
import { IdentityClient } from "./infrastructure/identity/identity-client.js";
import { database } from "./infrastructure/sql/database.js";
import { SqlCatalogRepository } from "./infrastructure/sql/catalog-repository.js";
import { createServer } from "./interfaces/http/server.js";

await database();

const catalogs = new CatalogService(new SqlCatalogRepository());
const identity = new IdentityClient(config);

createServer(catalogs, identity, config, async () => {
  await (await database()).request().query("SELECT 1");
}).listen(config.port, "0.0.0.0", () => {
  console.log(`catalogs-api listening on ${config.port}`);
});
