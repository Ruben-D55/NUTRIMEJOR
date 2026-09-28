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

function assertClinicalAccess(actor) {
  if (actor.organizationRole === "ASSISTANT") throw forbidden();
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
    this.repository = repository;
  }

  list(actor, patientId) {
    assertClinicalAccess(actor);
    return this.repository.list(actor, patientId ? recordId.parse(patientId) : null);
  }

  async get(actor, id) {
    assertClinicalAccess(actor);
    return requireResult(await this.repository.get(actor, recordId.parse(id)));
  }

  create(actor, input) {
    assertClinicalAccess(actor);
    return this.repository.create(actor, recordInput.parse(input));
  }

  async update(actor, id, input) {
    assertClinicalAccess(actor);
    return requireResult(await this.repository.update(
      actor,
      recordId.parse(id),
      recordUpdateInput.parse(input),
    ));
  }

  async publish(actor, id, input) {
    assertClinicalAccess(actor);
    return requireResult(await this.repository.publish(
      actor,
      recordId.parse(id),
      publishInput.parse(input),
    ));
  }

  async correct(actor, id, input) {
    assertClinicalAccess(actor);
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
    assertClinicalAccess(actor);
    return this.repository.clinicalRecord(actor, recordId.parse(patientId));
  }

  timeline(actor, patientId) {
    assertClinicalAccess(actor);
    return this.repository.timeline(actor, recordId.parse(patientId));
  }

  listEntries(actor, patientId, category) {
    assertClinicalAccess(actor);
    return this.repository.listEntries(actor, recordId.parse(patientId), category || null);
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
