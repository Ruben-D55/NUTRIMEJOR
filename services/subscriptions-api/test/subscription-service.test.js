import assert from "node:assert/strict";
import test from "node:test";
import { SubscriptionService } from "../src/application/subscription-service.js";

const owner = { id: 7, organizationId: "11111111-1111-4111-8111-111111111111", organizationRole: "OWNER" };

test("creates the organization trial lazily", async () => {
  const service = new SubscriptionService({ ensureTrial: async (actor) => ({ planCode: "BASIC", organizationId: actor.organizationId }) });
  const result = await service.current(owner);
  assert.equal(result.planCode, "BASIC");
  assert.equal(result.organizationId, owner.organizationId);
});

test("only organization managers can change a plan", async () => {
  const service = new SubscriptionService({ planExists: async () => true });
  await assert.rejects(
    service.changePlan({ ...owner, organizationRole: "ASSISTANT" }, { planCode: "PRO" }),
    (error) => error.code === "FORBIDDEN",
  );
});

test("rejects consumption when a feature is disabled", async () => {
  const service = new SubscriptionService({ consume: async () => ({ outcome: "disabled" }) });
  await assert.rejects(
    service.consume(owner, { featureCode: "planning.generator", amount: 1 }),
    (error) => error.code === "FEATURE_NOT_ENTITLED",
  );
});

test("returns the updated usage after consuming quota", async () => {
  const feature = { code: "documents.pdf", quota: 10, used: 2, remaining: 8 };
  const service = new SubscriptionService({ consume: async () => ({ outcome: "consumed", feature }) });
  assert.deepEqual(await service.consume(owner, { featureCode: "documents.pdf", amount: 2 }), feature);
});
