import {
  availabilityExceptionInput,
  availabilityRuleInput,
  dateRange,
  recordId,
  recordInput,
  rescheduleInput,
  statusInput,
} from "../domain/record.js";
import { DomainError, forbidden, notFound } from "../domain/errors.js";

function assertScope(actor, patientId, write = false) {
  if (actor.organizationRole !== "PATIENT") return;
  if (!patientId || !actor.patientId || actor.patientId.toLowerCase() !== String(patientId).toLowerCase()) throw forbidden();
  if (write !== false && write !== "appointment") throw forbidden();
}

const transitions = {
  scheduled: new Set(["confirmed", "cancelled"]),
  confirmed: new Set(["completed", "cancelled", "no_show"]),
  completed: new Set(),
  cancelled: new Set(),
  no_show: new Set(),
};

export class RecordService {
  constructor(repository) {
    this.repository = repository;
  }

  list(actor, filters = {}) {
    const patientId=filters.patientId ? recordId.parse(filters.patientId) : null;
    assertScope(actor, patientId);
    return this.repository.list(actor, {
      patientId,
      from: filters.from || null,
      to: filters.to || null,
    });
  }

  async get(actor, id) {
    const item = await this.repository.get(actor, recordId.parse(id));
    if (!item) throw notFound();
    assertScope(actor, item.patientId);
    return item;
  }

  async create(actor, input) {
    const parsed=recordInput.parse(input); assertScope(actor, parsed.patientId, "appointment");
    const result = await this.repository.create(actor, parsed);
    if (result?.conflict) {
      throw new DomainError("El profesional ya tiene una cita en ese horario.", 409, "APPOINTMENT_CONFLICT");
    }
    if (result?.unavailable) {
      throw new DomainError("El horario está fuera de la disponibilidad configurada.", 422, "OUTSIDE_AVAILABILITY");
    }
    return result;
  }

  async changeStatus(actor, id, input) {
    const parsed = statusInput.parse(input);
    const current = await this.repository.get(actor, recordId.parse(id));
    if (!current) throw notFound();
    assertScope(actor, current.patientId, ["confirmed", "cancelled"].includes(parsed.status) ? "appointment" : true);
    if (!transitions[current.status]?.has(parsed.status)) {
      throw new DomainError(
        `No se permite cambiar una cita de ${current.status} a ${parsed.status}.`,
        409,
        "INVALID_STATUS_TRANSITION",
      );
    }
    const item = await this.repository.changeStatus(actor, current.id, parsed);
    if (item?.conflict) throw new DomainError("La cita fue modificada por otro usuario.", 409, "VERSION_CONFLICT");
    return item;
  }

  async reschedule(actor, id, input) {
    const parsed = rescheduleInput.parse(input);
    const current = await this.repository.get(actor, recordId.parse(id));
    if (!current) throw notFound();
    assertScope(actor, current.patientId, "appointment");
    if (!["scheduled", "confirmed"].includes(current.status)) {
      throw new DomainError("Solo se puede reprogramar una cita pendiente o confirmada.", 409, "APPOINTMENT_NOT_RESCHEDULABLE");
    }
    const result = await this.repository.reschedule(actor, current.id, parsed);
    if (result?.conflict) throw new DomainError("El profesional ya tiene una cita en ese horario.", 409, "APPOINTMENT_CONFLICT");
    if (result?.unavailable) throw new DomainError("El horario está fuera de la disponibilidad configurada.", 422, "OUTSIDE_AVAILABILITY");
    if (result?.versionConflict) throw new DomainError("La cita fue modificada por otro usuario.", 409, "VERSION_CONFLICT");
    return result;
  }

  history(actor, id) {
    return this.repository.history(actor, recordId.parse(id));
  }

  availability(actor) {
    if (actor.organizationRole === "PATIENT") throw forbidden();
    return this.repository.availability(actor);
  }

  addAvailabilityRule(actor, input) {
    if (actor.organizationRole === "PATIENT") throw forbidden();
    return this.repository.addAvailabilityRule(actor, availabilityRuleInput.parse(input));
  }

  addAvailabilityException(actor, input) {
    if (actor.organizationRole === "PATIENT") throw forbidden();
    return this.repository.addAvailabilityException(actor, availabilityExceptionInput.parse(input));
  }

  slots(actor, input) {
    return this.repository.slots(actor, dateRange.parse(input));
  }
}
