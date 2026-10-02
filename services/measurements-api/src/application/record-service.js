import {
  calculateDerivedMeasurements,
  compareValues,
  legacyMeasurementInput,
  recordId,
  recordInput,
  evaluatorInput,
  sportAssessmentInput,
  calculateSport,
} from "../domain/record.js";
import { DomainError, forbidden, notFound } from "../domain/errors.js";

function assertAccess(actor, patientId = null, write = false) {
  if (actor.organizationRole === "ASSISTANT") throw forbidden();
  if (actor.organizationRole === "PATIENT"
    && (write || !patientId || !actor.patientId || actor.patientId.toLowerCase() !== String(patientId).toLowerCase())) throw forbidden();
}

export class RecordService {
  constructor(repository, entitlements = null) {
    this.repository = repository;
    this.entitlements = entitlements;
  }

  list(actor, patientId) {
    const parsed=patientId ? recordId.parse(patientId) : null; assertAccess(actor, parsed);
    return this.repository.list(actor, parsed);
  }

  async get(actor, id) {
    const item = await this.repository.get(actor, recordId.parse(id));
    if (!item) throw notFound();
    assertAccess(actor, item.patientId);
    return item;
  }

  async create(actor, input) {
    assertAccess(actor, null, true);
    const parsed = recordInput.parse(input);
    if (parsed.advancedMeasurements.length || parsed.bodyComposition.length) {
      await this.entitlements.assert(actor.organizationId, "measurements.advanced");
    }
    return this.repository.create(actor, {
      ...parsed,
      calculations: calculateDerivedMeasurements(parsed.measurements),
    });
  }

  async comparison(actor, patientId) {
    const parsed=recordId.parse(patientId); assertAccess(actor, parsed);
    return compareValues(await this.repository.comparison(actor, parsed));
  }

  importLegacy(actor, input) {
    assertAccess(actor);
    const parsed = legacyMeasurementInput.parse(input);
    const measurements = [
      ...(parsed.weightKg === null ? [] : [{ type: "weight", value: parsed.weightKg, unit: "kg" }]),
      ...(parsed.heightCm === null ? [] : [{ type: "height", value: parsed.heightCm, unit: "cm" }]),
    ];
    return this.repository.importLegacy(actor, {
      ...parsed,
      calculations: calculateDerivedMeasurements(measurements),
    });
  }

  async createEvaluator(actor, input) {
    assertAccess(actor);
    await this.entitlements.assert(actor.organizationId, "measurements.sport");
    return this.repository.createEvaluator(actor, evaluatorInput.parse(input));
  }

  async createSport(actor, input) {
    assertAccess(actor);
    await this.entitlements.assert(actor.organizationId, "measurements.sport");
    const parsed = sportAssessmentInput.parse(input);
    const result = await this.repository.createSport(actor, {
      ...parsed,
      calculations: calculateSport(parsed),
    });
    if (result.invalidEvaluator) {
      throw new DomainError("El evaluador no posee el nivel ISAK requerido.", 422, "ISAK_LEVEL_REQUIRED");
    }
    return result;
  }

  async getSport(actor, id) {
    assertAccess(actor);
    await this.entitlements.assert(actor.organizationId, "measurements.sport");
    const result = await this.repository.getSport(actor, recordId.parse(id));
    if (!result) throw notFound();
    return result;
  }

  async sportComparison(actor, patientId) {
    assertAccess(actor);
    await this.entitlements.assert(actor.organizationId, "measurements.sport");
    return compareValues(await this.repository.sportComparison(actor, recordId.parse(patientId)));
  }
}
