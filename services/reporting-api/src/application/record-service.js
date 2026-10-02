import { dashboardDate, recordId, recordInput, statusInput } from "../domain/record.js";
import { forbidden, notFound } from "../domain/errors.js";

function assertAccess(actor, patientId = null, write = false) {
  if (actor.organizationRole === "ASSISTANT") throw forbidden();
  if (actor.organizationRole === "PATIENT"
    && (write || !patientId || !actor.patientId || actor.patientId.toLowerCase() !== String(patientId).toLowerCase())) throw forbidden();
}

export class RecordService {
  constructor(repository, projections = null) {
    this.repository = repository;
    this.projections = projections;
  }

  list(actor, patientId) {
    const normalizedPatientId = patientId ? recordId.parse(patientId) : null;
    assertAccess(actor, normalizedPatientId);
    return this.repository.list(actor, normalizedPatientId);
  }

  async get(actor, id) {
    const item = await this.repository.get(actor, recordId.parse(id));
    if (!item) throw notFound();
    assertAccess(actor, item.patientId);
    return item;
  }

  create(actor, input) {
    assertAccess(actor, null, true);
    return this.repository.create(actor, recordInput.parse(input));
  }

  async update(actor, id, input) {
    assertAccess(actor);
    const item = await this.repository.update(actor, recordId.parse(id), recordInput.parse(input));
    if (!item) throw notFound();
    return item;
  }

  async changeStatus(actor, id, input) {
    assertAccess(actor);
    const item = await this.repository.changeStatus(
      actor,
      recordId.parse(id),
      statusInput.parse(input).status,
    );
    if (!item) throw notFound();
    return item;
  }

  organizationDashboard(actor, from, to) {
    assertAccess(actor);
    const today = new Date().toISOString().slice(0, 10);
    const defaultFrom = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
    return this.projections.organizationDashboard(
      actor,
      dashboardDate.parse(from || defaultFrom),
      dashboardDate.parse(to || today),
    );
  }

  patientDashboard(actor, patientId) {
    const parsed=recordId.parse(patientId); assertAccess(actor, parsed);
    return this.projections.patientDashboard(actor, parsed);
  }

  async rebuild(actor) {
    assertAccess(actor);
    const result = await this.projections.rebuild(actor);
    if (result.forbidden) throw forbidden("Solo propietarios y administradores pueden reconstruir proyecciones.");
    return result;
  }
}
