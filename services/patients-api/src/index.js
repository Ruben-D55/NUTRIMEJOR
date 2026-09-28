import { config } from "./config.js";
import { PatientService } from "./application/patient-service.js";
import { IdentityClient } from "./infrastructure/identity/identity-client.js";
import { database } from "./infrastructure/sql/database.js";
import { SqlPatientRepository } from "./infrastructure/sql/patient-repository.js";
import { createServer } from "./interfaces/http/server.js";
import { SqlOutboxRepository } from "./infrastructure/messaging/outbox-repository.js";
import { startOutboxPublisher } from "./infrastructure/messaging/outbox-publisher.js";

await database();

const patients = new PatientService(new SqlPatientRepository());
const identity = new IdentityClient(config);
startOutboxPublisher(new SqlOutboxRepository(), config);

createServer(patients, identity, config, async () => {
  await (await database()).request().query("SELECT 1");
}).listen(config.port, "0.0.0.0", () => {
  console.log(`patients-api listening on ${config.port}`);
});
