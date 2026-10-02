import {
  clinicalEntryInput,
  clinicalEntryUpdateInput,
  correctionInput,
  diagnosisInput,
  followUpInput,
  goalInput,
  legacyHistoryInput,
  publishInput,
  recordId,
  recordInput,
  recordUpdateInput,
} from "../domain/record.js";
import { conflict, forbidden, notFound } from "../domain/errors.js";

function assertClinicalAccess(actor, patientId = null, write = false) {
  if (actor.organizationRole === "ASSISTANT") throw forbidden();
  if (actor.organizationRole === "PATIENT"
    && (write || !patientId || !actor.patientId || actor.patientId.toLowerCase() !== String(patientId).toLowerCase())) {
    throw forbidden();
  }
}

function auditedRepository(repository) {
  if (!repository.auditAccess) return repository;
  const reads = new Set(["list", "get", "versions", "clinicalRecord", "timeline", "listEntries", "listDiagnoses", "listGoals", "listFollowUps"]);
  return new Proxy(repository, {
    get(target, property, receiver) {
      const original = Reflect.get(target, property, receiver);
      if (typeof original !== "function" || property === "auditAccess") return original;
      return async (...args) => {
        const actor = args[0];
        try {
          const result = await original.apply(target, args);
          const sample = Array.isArray(result) ? result[0] : result;
          await target.auditAccess(actor, {
            action: `${reads.has(String(property)) ? "read" : "write"}.${String(property)}`,
            entityType: "clinical_record",
            entityId: sample?.id || args[1] || null,
            patientId: sample?.patientId || (String(property).includes("clinical") || String(property).includes("timeline") || String(property).includes("Entries") ? args[1] : null),
            success: true,
          }).catch(() => undefined);
          return result;
        } catch (error) {
          await target.auditAccess(actor, {
            action: `${reads.has(String(property)) ? "read" : "write"}.${String(property)}`,
            entityType: "clinical_record", entityId: args[1] || null, patientId: null,
            success: false, details: { code: error?.code || "ERROR" },
          }).catch(() => undefined);
          throw error;
        }
      };
    },
  });
}

function requireResult(result) {
  if (!result) throw notFound();
  if (result.error === "not_found") throw notFound();
  if (result.error === "version_conflict") {
    throw conflict("La consulta cambió desde que fue abierta.", "VERSION_CONFLICT");
  }
  if (result.error === "not_draft") {
    throw conflict("Solo se puede editar o publicar una consulta en borrador.", "CONSULTATION_NOT_DRAFT");
  }
  if (result.error === "not_published") {
    throw conflict("Solo una consulta publicada puede corregirse.", "CONSULTATION_NOT_PUBLISHED");
  }
  return result;
}

export class RecordService {
  constructor(repository) {
    this.repository = auditedRepository(repository);
  }

  list(actor, patientId) {
    const parsed = patientId ? recordId.parse(patientId) : null;
    assertClinicalAccess(actor, parsed);
    return this.repository.list(actor, parsed);
  }

  async get(actor, id) {
    if (actor.organizationRole === "PATIENT") {
      const result = requireResult(await this.repository.get(actor, recordId.parse(id)));
      assertClinicalAccess(actor, result.patientId);
      return result;
    }
    assertClinicalAccess(actor);
    return requireResult(await this.repository.get(actor, recordId.parse(id)));
  }

  create(actor, input) {
    assertClinicalAccess(actor, null, true);
    return this.repository.create(actor, recordInput.parse(input));
  }

  async update(actor, id, input) {
    assertClinicalAccess(actor, null, true);
    return requireResult(await this.repository.update(
      actor,
      recordId.parse(id),
      recordUpdateInput.parse(input),
    ));
  }

  async publish(actor, id, input) {
    assertClinicalAccess(actor, null, true);
    return requireResult(await this.repository.publish(
      actor,
      recordId.parse(id),
      publishInput.parse(input),
    ));
  }

  async correct(actor, id, input) {
    assertClinicalAccess(actor, null, true);
    return requireResult(await this.repository.correct(
      actor,
      recordId.parse(id),
      correctionInput.parse(input),
    ));
  }

  versions(actor, id) {
    assertClinicalAccess(actor);
    return this.repository.versions(actor, recordId.parse(id));
  }

  clinicalRecord(actor, patientId) {
    const parsed=recordId.parse(patientId); assertClinicalAccess(actor, parsed);
    return this.repository.clinicalRecord(actor, parsed);
  }

  timeline(actor, patientId) {
    const parsed=recordId.parse(patientId); assertClinicalAccess(actor, parsed);
    return this.repository.timeline(actor, parsed);
  }

  listEntries(actor, patientId, category) {
    const parsed=recordId.parse(patientId); assertClinicalAccess(actor, parsed);
    return this.repository.listEntries(actor, parsed, category || null);
  }

  createEntry(actor, patientId, input) {
    assertClinicalAccess(actor);
    return this.repository.createEntry(
      actor,
      recordId.parse(patientId),
      clinicalEntryInput.parse(input),
    );
  }

  async updateEntry(actor, id, input) {
    assertClinicalAccess(actor);
    return requireResult(await this.repository.updateEntry(
      actor,
      recordId.parse(id),
      clinicalEntryUpdateInput.parse(input),
    ));
  }

  async archiveEntry(actor, id) {
    assertClinicalAccess(actor);
    return requireResult(await this.repository.archiveEntry(actor, recordId.parse(id)));
  }

  listDiagnoses(actor, consultationId) {
    assertClinicalAccess(actor);
    return this.repository.listDiagnoses(actor, recordId.parse(consultationId));
  }

  createDiagnosis(actor, consultationId, input) {
    assertClinicalAccess(actor);
    return this.repository.createDiagnosis(
      actor,
      recordId.parse(consultationId),
      diagnosisInput.parse(input),
    ).then(requireResult);
  }

  listGoals(actor, consultationId) {
    assertClinicalAccess(actor);
    return this.repository.listGoals(actor, recordId.parse(consultationId));
  }

  createGoal(actor, consultationId, input) {
    assertClinicalAccess(actor);
    return this.repository.createGoal(
      actor,
      recordId.parse(consultationId),
      goalInput.parse(input),
    ).then(requireResult);
  }

  listFollowUps(actor, consultationId) {
    assertClinicalAccess(actor);
    return this.repository.listFollowUps(actor, recordId.parse(consultationId));
  }

  createFollowUp(actor, consultationId, input) {
    assertClinicalAccess(actor);
    return this.repository.createFollowUp(
      actor,
      recordId.parse(consultationId),
      followUpInput.parse(input),
    ).then(requireResult);
  }

  importLegacyHistory(actor, input) {
    assertClinicalAccess(actor);
    return this.repository.importLegacyHistory(actor, legacyHistoryInput.parse(input));
  }
}
