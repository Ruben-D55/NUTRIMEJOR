import { z } from "zod";
import { DomainError, forbidden, notFound } from "../domain/errors.js";

const planChange = z.object({ planCode: z.enum(["BASIC", "PRO", "SPORT"]) });
const consumption = z.object({
  featureCode: z.string().trim().min(3).max(80),
  amount: z.coerce.number().int().min(1).max(10000).default(1),
});

export class SubscriptionService {
  constructor(repository) {
    this.repository = repository;
  }

  listPlans() {
    return this.repository.listPlans();
  }

  current(actor) {
    return this.repository.ensureTrial(actor);
  }

  async changePlan(actor, input) {
    if (!["OWNER", "ADMIN"].includes(actor.organizationRole)) {
      throw forbidden("Solo un propietario o administrador puede cambiar el plan.");
    }
    const { planCode } = planChange.parse(input);
    if (!(await this.repository.planExists(planCode))) throw notFound("Plan no encontrado.");
    return this.repository.changePlan(actor, planCode);
  }

  async cancel(actor, input = {}) {
    if (!["OWNER", "ADMIN"].includes(actor.organizationRole)) {
      throw forbidden("Solo un propietario o administrador puede cancelar el plan.");
    }
    return this.repository.cancel(actor, String(input.reason || "Cancelación solicitada").slice(0, 500));
  }

  async reactivate(actor) {
    if (!["OWNER", "ADMIN"].includes(actor.organizationRole)) {
      throw forbidden("Solo un propietario o administrador puede reactivar el plan.");
    }
    return this.repository.reactivate(actor);
  }

  history(actor) {
    return this.repository.history(actor);
  }

  entitlements(actor) {
    return this.repository.entitlements(actor);
  }

  async consume(actor, input) {
    const data = consumption.parse(input);
    const result = await this.repository.consume(actor, data.featureCode, data.amount);
    if (result.outcome === "disabled") {
      throw forbidden("La función no está incluida en el plan actual.", "FEATURE_NOT_ENTITLED");
    }
    if (result.outcome === "quota_exceeded") {
      throw new DomainError("Se alcanzó la cuota del plan para esta función.", 409, "QUOTA_EXCEEDED");
    }
    return result.feature;
  }
}
