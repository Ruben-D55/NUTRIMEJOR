import { z } from "zod";
import { conflict, forbidden, notFound } from "../domain/errors.js";

function assertPatientScope(actor, patientId, write = false) {
  if (actor.organizationRole !== "PATIENT") return;
  if (write || !actor.patientId || actor.patientId.toLowerCase() !== String(patientId).toLowerCase()) throw forbidden();
}

const idSchema = z.string().uuid();
const patientSchema = z.object({
  names: z.string().trim().min(2).max(100),
  lastNames: z.string().trim().min(2).max(100),
  preferredName: z.string().trim().max(100).optional().default(""),
  documentType: z.string().trim().max(20).optional().default(""),
  document: z.string().trim().max(30).optional().default(""),
  birthDate: z.union([z.string().date(), z.literal("")]).optional().default(""),
  sex: z.string().trim().max(20).optional().default(""),
  phone: z.string().trim().max(30).optional().default(""),
  email: z.union([z.string().email(), z.literal("")]).optional().default(""),
  address: z.string().trim().max(250).optional().default(""),
  city: z.string().trim().max(100).optional().default(""),
  country: z.string().trim().length(2).or(z.literal("")).optional().default(""),
  objective: z.string().trim().max(300).optional().default(""),
  photoPath: z.string().trim().max(500).optional().default(""),
  status: z.enum(["Activo", "Inactivo"]),
  version: z.coerce.number().int().positive().optional(),
});

const filtersSchema = z.object({
  query: z.string().trim().max(120).optional().default(""),
  status: z.enum(["Activo", "Inactivo"]).optional(),
  tagId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().max(500).optional(),
  paged: z.boolean().optional().default(false),
});
const contactSchema = z.object({
  type: z.enum(["phone", "email", "whatsapp", "other"]),
  value: z.string().trim().min(2).max(180),
  label: z.string().trim().max(60).optional().default(""),
  primary: z.boolean().optional().default(false),
});
const emergencySchema = z.object({
  name: z.string().trim().min(2).max(150),
  relationship: z.string().trim().max(80).optional().default(""),
  phone: z.string().trim().min(5).max(30),
  email: z.union([z.string().email(), z.literal("")]).optional().default(""),
  primary: z.boolean().optional().default(true),
});
const assignmentSchema = z.object({
  userId: z.coerce.number().int().positive(),
  role: z.enum(["NUTRITIONIST", "ASSISTANT"]).default("NUTRITIONIST"),
});
const tagSchema = z.object({
  name: z.string().trim().min(2).max(60),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().default("#047857"),
});
const consentSchema = z.object({
  type: z.string().trim().min(2).max(40),
  status: z.enum(["granted", "revoked"]),
  documentVersion: z.string().trim().min(1).max(40),
  evidence: z.string().trim().max(500).optional().default(""),
});
const historySchema = z.object({
  type: z.enum([
    "administrative_note",
    "contact_verified",
    "documentation_received",
    "consent_reviewed",
    "assignment_note",
  ]),
  notes: z.string().trim().min(2).max(5000),
});

export class PatientService {
  constructor(repository) { this.repository = repository; }

  async list(actor, input = {}) {
    if (actor.organizationRole === "PATIENT") throw forbidden();
    const filters = filtersSchema.parse(input);
    const result = await this.repository.list(actor, filters);
    return filters.paged ? result : result.items;
  }

  async get(actor, id) {
    const patientId = idSchema.parse(id);
    assertPatientScope(actor, patientId);
    const patient = await this.repository.get(actor, patientId);
    if (!patient) throw notFound();
    return patient;
  }

  async create(actor, input) {
    if (actor.organizationRole === "PATIENT") throw forbidden();
    const patient = patientSchema.parse(input);
    if (await this.repository.findDuplicate(actor, patient)) {
      throw conflict("Ya existe un paciente con el mismo documento o correo.", "PATIENT_DUPLICATE");
    }
    return this.repository.create(actor, patient);
  }

  async update(actor, id, input) {
    const patientId = idSchema.parse(id);
    assertPatientScope(actor, patientId, true);
    const patient = patientSchema.parse(input);
    if (await this.repository.findDuplicate(actor, patient, patientId)) {
      throw conflict("Ya existe un paciente con el mismo documento o correo.", "PATIENT_DUPLICATE");
    }
    const updated = await this.repository.update(actor, patientId, patient);
    if (!updated) throw notFound();
    return updated;
  }

  async remove(actor, id) {
    const patientId = idSchema.parse(id);
    assertPatientScope(actor, patientId, true);
    if (!(await this.repository.remove(actor, patientId))) throw notFound();
  }

  history(actor, id) { const value=idSchema.parse(id); assertPatientScope(actor, value); return this.repository.history(actor, value); }
  async addHistory(actor, id, input) {
    const value=idSchema.parse(id); assertPatientScope(actor, value, true);
    const result = await this.repository.addHistory(actor, value, historySchema.parse(input));
    if (!result) throw notFound();
    return result;
  }
  contacts(actor, id) { const value=idSchema.parse(id); assertPatientScope(actor, value); return this.repository.contacts(actor, value); }
  async addContact(actor, id, input) {
    const value=idSchema.parse(id); assertPatientScope(actor, value, true);
    const result = await this.repository.addContact(actor, value, contactSchema.parse(input));
    if (!result) throw notFound();
    return result;
  }
  emergencyContacts(actor, id) { const value=idSchema.parse(id); assertPatientScope(actor, value); return this.repository.emergencyContacts(actor, value); }
  async addEmergencyContact(actor, id, input) {
    const value=idSchema.parse(id); assertPatientScope(actor, value, true);
    const result = await this.repository.addEmergencyContact(actor, value, emergencySchema.parse(input));
    if (!result) throw notFound();
    return result;
  }
  assignments(actor, id) { const value=idSchema.parse(id); assertPatientScope(actor, value); return this.repository.assignments(actor, value); }
  async assign(actor, id, input) {
    const value=idSchema.parse(id); assertPatientScope(actor, value, true);
    const result = await this.repository.assign(actor, value, assignmentSchema.parse(input));
    if (!result) throw notFound();
    return result;
  }
  tags(actor, id) { const value=idSchema.parse(id); assertPatientScope(actor, value); return this.repository.tags(actor, value); }
  async addTag(actor, id, input) {
    const value=idSchema.parse(id); assertPatientScope(actor, value, true);
    const result = await this.repository.addTag(actor, value, tagSchema.parse(input));
    if (!result) throw notFound();
    return result;
  }
  consents(actor, id) { const value=idSchema.parse(id); assertPatientScope(actor, value); return this.repository.consents(actor, value); }
  async addConsent(actor, id, input) {
    const value=idSchema.parse(id); assertPatientScope(actor, value, true);
    const result = await this.repository.addConsent(actor, value, consentSchema.parse(input));
    if (!result) throw notFound();
    return result;
  }
}
