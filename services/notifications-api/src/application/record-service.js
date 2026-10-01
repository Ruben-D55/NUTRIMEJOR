import { recordId, recordInput, statusInput } from "../domain/record.js";
import { notFound } from "../domain/errors.js";
import { alertRuleInput, notificationInput, patientId, preferenceInput } from "../domain/delivery.js";

export class RecordService {
  constructor(repository, delivery = null, entitlements = null) {
    this.repository = repository;
    this.delivery = delivery;
    this.entitlements = entitlements;
  }

  list(actor, patientId) {
    const normalizedPatientId = patientId ? recordId.parse(patientId) : null;
    return this.repository.list(actor, normalizedPatientId);
  }

  async get(actor, id) {
    const item = await this.repository.get(actor, recordId.parse(id));
    if (!item) throw notFound();
    return item;
  }

  create(actor, input) {
    return this.repository.create(actor, recordInput.parse(input));
  }

  async update(actor, id, input) {
    const item = await this.repository.update(actor, recordId.parse(id), recordInput.parse(input));
    if (!item) throw notFound();
    return item;
  }

  async changeStatus(actor, id, input) {
    const item = await this.repository.changeStatus(
      actor,
      recordId.parse(id),
      statusInput.parse(input).status,
    );
    if (!item) throw notFound();
    return item;
  }

  async setPreference(actor, input) {
    await this.entitlements.assert(actor.organizationId, "notifications.automation");
    return this.delivery.setPreference(actor, preferenceInput.parse(input));
  }

  preferences(actor, id) {
    return this.delivery.preferences(actor, patientId.parse(id));
  }

  createNotification(actor, input) {
    return this.delivery.create(actor, notificationInput.parse(input));
  }

  listNotifications(actor, id) {
    return this.delivery.list(actor, id ? patientId.parse(id) : null);
  }

  async createAlertRule(actor, input) {
    await this.entitlements.assert(actor.organizationId, "notifications.automation");
    return this.delivery.createAlertRule(actor, alertRuleInput.parse(input));
  }

  alertRules(actor) {
    return this.delivery.alertRules(actor);
  }

  async updateAlertRule(actor, id, input) {
    await this.entitlements.assert(actor.organizationId, "notifications.automation");
    const item = await this.delivery.updateAlertRule(actor, recordId.parse(id), alertRuleInput.parse(input));
    if (!item) throw notFound();
    return item;
  }
}
