import { dashboardDate, recordId, recordInput, statusInput } from "../domain/record.js";
import { forbidden, notFound } from "../domain/errors.js";

function assertAccess(actor) {
  if (actor.organizationRole === "ASSISTANT") throw forbidden();
}

export class RecordService {
  constructor(repository, projections = null) {
    this.repository = repository;
    this.projections = projections;
  }

  list(actor, patientId) {
    assertAccess(actor);
    const normalizedPatientId = patientId ? recordId.parse(patientId) : null;
    return this.repository.list(actor, normalizedPatientId);
  }

  async get(actor, id) {
    assertAccess(actor);
    const item = await this.repository.get(actor, recordId.parse(id));
    if (!item) throw notFound();
    return item;
  }

  create(actor, input) {
    assertAccess(actor);
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
    assertAccess(actor);
    return this.projections.patientDashboard(actor, recordId.parse(patientId));
  }

  async rebuild(actor) {
    assertAccess(actor);
    const result = await this.projections.rebuild(actor);
    if (result.forbidden) throw forbidden("Solo propietarios y administradores pueden reconstruir proyecciones.");
    return result;
  }
}
