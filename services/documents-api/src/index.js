import { config } from "./config.js";
import { RecordService } from "./application/record-service.js";
import { IdentityClient } from "./infrastructure/identity/identity-client.js";
import { SqlOutboxRepository } from "./infrastructure/messaging/outbox-repository.js";
import { startOutboxPublisher } from "./infrastructure/messaging/outbox-publisher.js";
import { database, ready } from "./infrastructure/sql/database.js";
import { SqlRecordRepository } from "./infrastructure/sql/record-repository.js";
import { SqlGenerationRepository } from "./infrastructure/sql/generation-repository.js";
import { startGenerationWorker } from "./infrastructure/pdf/generation-worker.js";
import { EntitlementClient } from "./infrastructure/subscriptions/entitlement-client.js";
import { createServer } from "./interfaces/http/server.js";

await database();

const generation = new SqlGenerationRepository();
const records = new RecordService(new SqlRecordRepository(), generation, new EntitlementClient(config));
const identity = new IdentityClient(config);
startOutboxPublisher(new SqlOutboxRepository(), config);
startGenerationWorker(generation);

createServer(records, identity, config, ready).listen(config.port, "0.0.0.0", () => {
  console.log(`${config.serviceName} listening on ${config.port}`);
});
