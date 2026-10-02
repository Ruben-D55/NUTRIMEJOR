import { recordId, recordInput, statusInput } from "../domain/record.js";
import { forbidden, notFound } from "../domain/errors.js";
import { accessInput, generationInput, patientId, templateInput } from "../domain/generation.js";
import { DomainError } from "../domain/errors.js";

export class RecordService {
  constructor(repository, generation = null, entitlements = null) {
    this.repository = repository;
    this.generation = generation;
    this.entitlements = entitlements;
  }

  list(actor, patientId) {
    const normalizedPatientId = patientId ? recordId.parse(patientId) : null;
    if (actor.organizationRole === "PATIENT" && normalizedPatientId !== actor.patientId) throw forbidden();
    return this.repository.list(actor, normalizedPatientId);
  }

  async get(actor, id) {
    const item = await this.repository.get(actor, recordId.parse(id));
    if (!item) throw notFound();
    if (actor.organizationRole === "PATIENT" && item.patientId !== actor.patientId) throw forbidden();
    return item;
  }

  create(actor, input) {
    if (actor.organizationRole === "PATIENT") throw forbidden();
    return this.repository.create(actor, recordInput.parse(input));
  }

  async update(actor, id, input) {
    if (actor.organizationRole === "PATIENT") throw forbidden();
    const item = await this.repository.update(actor, recordId.parse(id), recordInput.parse(input));
    if (!item) throw notFound();
    return item;
  }

  async changeStatus(actor, id, input) {
    if (actor.organizationRole === "PATIENT") throw forbidden();
    const item = await this.repository.changeStatus(
      actor,
      recordId.parse(id),
      statusInput.parse(input).status,
    );
    if (!item) throw notFound();
    return item;
  }

  createTemplate(actor, input) {
    if (["PATIENT", "ASSISTANT"].includes(actor.organizationRole)) throw forbidden();
    return this.generation.createTemplate(actor, templateInput.parse(input));
  }

  templates(actor, type) {
    return this.generation.templates(actor, type || null);
  }

  async generate(actor, input) {
    if (["PATIENT", "ASSISTANT"].includes(actor.organizationRole)) throw forbidden();
    const parsed = generationInput.parse(input);
    await this.entitlements.consume(actor.organizationId, "documents.pdf");
    const result = await this.generation.create(actor, parsed);
    if (result.templateNotFound) throw notFound("Plantilla no encontrada.");
    return result;
  }

  generatedDocuments(actor, id) {
    const parsed=id ? patientId.parse(id) : null;
    if (actor.organizationRole === "PATIENT" && parsed !== actor.patientId) throw forbidden();
    return this.generation.list(actor, parsed);
  }

  async generatedDocument(actor, id) {
    const item = await this.generation.get(actor, recordId.parse(id));
    if (!item) throw notFound();
    if (actor.organizationRole === "PATIENT" && item.patientId !== actor.patientId) throw forbidden();
    return item;
  }

  async accessUrl(actor, id, input, baseUrl) {
    const parsed = accessInput.parse(input);
    const result = await this.generation.createAccessToken(actor, recordId.parse(id), parsed.expiresInMinutes);
    if (!result) throw notFound();
    if (actor.organizationRole === "PATIENT" && result.patientId && result.patientId !== actor.patientId) throw forbidden();
    if (result.notReady) throw new DomainError("El documento aún no está listo.", 409, "DOCUMENT_NOT_READY");
    return { url: `${baseUrl}/v1/download/${result.token}`, expiresAt: result.expiresAt };
  }

  resolveToken(token) {
    return this.generation.resolveToken(token);
  }
}
