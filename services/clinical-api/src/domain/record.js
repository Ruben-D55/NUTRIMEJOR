import { z } from "zod";

export const recordId = z.string().uuid();

export const consultationTypes = [
  "initial",
  "follow_up",
  "revisit",
  "sports_evaluation",
  "anthropometric_control",
  "nutritional_control",
  "closure",
];

const consultationBody = {
  patientId: z.string().uuid(),
  title: z.string().trim().min(2).max(200),
  consultationType: z.enum(consultationTypes).optional().default("initial"),
  occurredAt: z.iso.datetime().optional(),
  data: z.record(z.string(), z.unknown()).optional().default({}),
};

export const recordInput = z.object({
  ...consultationBody,
  status: z.literal("draft").optional().default("draft"),
});

export const recordUpdateInput = z.object({
  ...consultationBody,
  expectedVersion: z.number().int().positive(),
});

export const publishInput = z.object({
  reason: z.string().trim().min(3).max(500).optional().default("Publicación de la consulta"),
  expectedVersion: z.number().int().positive(),
});

export const correctionInput = z.object({
  ...consultationBody,
  reason: z.string().trim().min(5).max(500),
  expectedVersion: z.number().int().positive(),
});

export const clinicalEntryCategories = [
  "current_problem",
  "personal_history",
  "family_history",
  "symptom",
  "surgery",
  "medication",
  "supplement",
  "gynecological_history",
  "clinical_note",
];

export const clinicalEntryInput = z.object({
  consultationId: z.string().uuid().nullable().optional().default(null),
  category: z.enum(clinicalEntryCategories),
  title: z.string().trim().min(2).max(240),
  details: z.record(z.string(), z.unknown()).optional().default({}),
  status: z.enum(["active", "resolved", "inactive"]).optional().default("active"),
  startDate: z.iso.datetime().nullable().optional().default(null),
  endDate: z.iso.datetime().nullable().optional().default(null),
  source: z.string().trim().max(120).nullable().optional().default(null),
});

export const clinicalEntryUpdateInput = clinicalEntryInput.extend({
  expectedVersion: z.number().int().positive(),
});

export const diagnosisInput = z.object({
  code: z.string().trim().max(60).nullable().optional().default(null),
  statement: z.string().trim().min(3).max(500),
  etiology: z.string().trim().max(1000).nullable().optional().default(null),
  signs: z.string().trim().max(1000).nullable().optional().default(null),
  status: z.enum(["active", "resolved"]).optional().default("active"),
});

export const goalInput = z.object({
  title: z.string().trim().min(2).max(240),
  description: z.string().trim().max(1000).nullable().optional().default(null),
  targetValue: z.number().finite().nullable().optional().default(null),
  unit: z.string().trim().max(40).nullable().optional().default(null),
  dueDate: z.iso.datetime().nullable().optional().default(null),
  status: z.enum(["active", "achieved", "cancelled"]).optional().default("active"),
});

export const followUpInput = z.object({
  summary: z.string().trim().min(3).max(1000),
  adherence: z.number().min(0).max(100).nullable().optional().default(null),
  difficulties: z.string().trim().max(1000).nullable().optional().default(null),
  nextSteps: z.string().trim().max(1000).nullable().optional().default(null),
  scheduledAt: z.iso.datetime().nullable().optional().default(null),
});

export const legacyHistoryInput = z.object({
  patientId: z.string().uuid(),
  legacyHistoryId: z.union([z.string(), z.number()]).transform(String),
  type: z.string().trim().max(120).nullable().optional().default(null),
  notes: z.string().max(10000).nullable().optional().default(null),
  recordedAt: z.iso.datetime().nullable().optional().default(null),
  source: z.string().trim().min(2).max(120).optional().default("patients-db"),
});

export const resource = Object.freeze({
  label: "consulta",
  path: "/v1/consultations",
  eventPrefix: "clinical",
});
