import { config } from "./config.js";
import { RecordService } from "./application/record-service.js";
import { IdentityClient } from "./infrastructure/identity/identity-client.js";
import { SqlOutboxRepository } from "./infrastructure/messaging/outbox-repository.js";
import { startOutboxPublisher } from "./infrastructure/messaging/outbox-publisher.js";
import { database, ready } from "./infrastructure/sql/database.js";
import { SqlRecordRepository } from "./infrastructure/sql/record-repository.js";
import { SqlDeliveryRepository } from "./infrastructure/sql/delivery-repository.js";
import { startEventConsumer } from "./infrastructure/messaging/event-consumer.js";
import { startDispatcher } from "./infrastructure/delivery/dispatcher.js";
import { EntitlementClient } from "./infrastructure/subscriptions/entitlement-client.js";
import { createServer } from "./interfaces/http/server.js";

await database();

const delivery = new SqlDeliveryRepository();
const records = new RecordService(new SqlRecordRepository(), delivery, new EntitlementClient(config));
const identity = new IdentityClient(config);
startOutboxPublisher(new SqlOutboxRepository(), config);
startEventConsumer(delivery, config);
startDispatcher(delivery);

createServer(records, identity, config, ready).listen(config.port, "0.0.0.0", () => {
  console.log(`${config.serviceName} listening on ${config.port}`);
});
