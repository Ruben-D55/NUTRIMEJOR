import {
  availabilityExceptionInput,
  availabilityRuleInput,
  dateRange,
  recordId,
  recordInput,
  statusInput,
} from "../domain/record.js";
import { DomainError, notFound } from "../domain/errors.js";

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
    return this.repository.list(actor, {
      patientId: filters.patientId ? recordId.parse(filters.patientId) : null,
      from: filters.from || null,
      to: filters.to || null,
    });
  }

  async get(actor, id) {
    const item = await this.repository.get(actor, recordId.parse(id));
    if (!item) throw notFound();
    return item;
  }

  async create(actor, input) {
    const result = await this.repository.create(actor, recordInput.parse(input));
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

  history(actor, id) {
    return this.repository.history(actor, recordId.parse(id));
  }

  availability(actor) {
    return this.repository.availability(actor);
  }

  addAvailabilityRule(actor, input) {
    return this.repository.addAvailabilityRule(actor, availabilityRuleInput.parse(input));
  }

  addAvailabilityException(actor, input) {
    return this.repository.addAvailabilityException(actor, availabilityExceptionInput.parse(input));
  }

  slots(actor, input) {
    return this.repository.slots(actor, dateRange.parse(input));
  }
}
