import { recordId, recordInput, statusInput } from "../domain/record.js";
import { forbidden, notFound } from "../domain/errors.js";
import { alertRuleInput, notificationInput, patientId, preferenceInput } from "../domain/delivery.js";

function isPatient(actor) {
  return actor.organizationRole === "PATIENT";
}

function assertOwnPatient(actor, requestedPatientId) {
  if (!isPatient(actor)) return;
  if (!actor.patientId || !requestedPatientId
    || actor.patientId.toLowerCase() !== requestedPatientId.toLowerCase()) {
    throw forbidden("Solo puedes consultar tus propias notificaciones.");
  }
}

function denyPatientWrite(actor) {
  if (isPatient(actor)) throw forbidden("Tu rol no permite modificar notificaciones.");
}

export class RecordService {
  constructor(repository, delivery = null, entitlements = null) {
    this.repository = repository;
    this.delivery = delivery;
    this.entitlements = entitlements;
  }

  list(actor, patientId) {
    const normalizedPatientId = patientId ? recordId.parse(patientId) : (isPatient(actor) ? actor.patientId : null);
    assertOwnPatient(actor, normalizedPatientId);
    return this.repository.list(actor, normalizedPatientId);
  }

  async get(actor, id) {
    const item = await this.repository.get(actor, recordId.parse(id));
    if (!item) throw notFound();
    assertOwnPatient(actor, item.patientId);
    return item;
  }

  create(actor, input) {
    denyPatientWrite(actor);
    return this.repository.create(actor, recordInput.parse(input));
  }

  async update(actor, id, input) {
    denyPatientWrite(actor);
    const item = await this.repository.update(actor, recordId.parse(id), recordInput.parse(input));
    if (!item) throw notFound();
    return item;
  }

  async changeStatus(actor, id, input) {
    denyPatientWrite(actor);
    const item = await this.repository.changeStatus(
      actor,
      recordId.parse(id),
      statusInput.parse(input).status,
    );
    if (!item) throw notFound();
    return item;
  }

  async setPreference(actor, input) {
    denyPatientWrite(actor);
    await this.entitlements.assert(actor.organizationId, "notifications.automation");
    return this.delivery.setPreference(actor, preferenceInput.parse(input));
  }

  preferences(actor, id) {
    const normalizedPatientId = patientId.parse(id);
    assertOwnPatient(actor, normalizedPatientId);
    return this.delivery.preferences(actor, normalizedPatientId);
  }

  createNotification(actor, input) {
    denyPatientWrite(actor);
    return this.delivery.create(actor, notificationInput.parse(input));
  }

  listNotifications(actor, id) {
    const normalizedPatientId = id ? patientId.parse(id) : (isPatient(actor) ? actor.patientId : null);
    assertOwnPatient(actor, normalizedPatientId);
    return this.delivery.list(actor, normalizedPatientId);
  }

  async createAlertRule(actor, input) {
    denyPatientWrite(actor);
    await this.entitlements.assert(actor.organizationId, "notifications.automation");
    return this.delivery.createAlertRule(actor, alertRuleInput.parse(input));
  }

  alertRules(actor) {
    if (isPatient(actor)) throw forbidden("Tu rol no permite consultar reglas internas.");
    return this.delivery.alertRules(actor);
  }

  async updateAlertRule(actor, id, input) {
    denyPatientWrite(actor);
    await this.entitlements.assert(actor.organizationId, "notifications.automation");
    const item = await this.delivery.updateAlertRule(actor, recordId.parse(id), alertRuleInput.parse(input));
    if (!item) throw notFound();
    return item;
  }
}
