import { config } from "./config.js";
import { RecordService } from "./application/record-service.js";
import { IdentityClient } from "./infrastructure/identity/identity-client.js";
import { SqlOutboxRepository } from "./infrastructure/messaging/outbox-repository.js";
import { startOutboxPublisher } from "./infrastructure/messaging/outbox-publisher.js";
import { database, ready } from "./infrastructure/sql/database.js";
import { SqlRecordRepository } from "./infrastructure/sql/record-repository.js";
import { SqlProjectionRepository } from "./infrastructure/sql/projection-repository.js";
import { startEventConsumer } from "./infrastructure/messaging/event-consumer.js";
import { createServer } from "./interfaces/http/server.js";

await database();

const projections = new SqlProjectionRepository();
const records = new RecordService(new SqlRecordRepository(), projections);
const identity = new IdentityClient(config);
startOutboxPublisher(new SqlOutboxRepository(), config);
startEventConsumer(projections, config);

createServer(records, identity, config, ready).listen(config.port, "0.0.0.0", () => {
  console.log(`${config.serviceName} listening on ${config.port}`);
});
