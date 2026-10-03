import { z } from "zod";

export const recordId = z.string().uuid();
const dateTime = z.iso.datetime({ offset: true });

export const recordInput = z.object({
  patientId: z.string().uuid(),
  title: z.string().trim().min(2).max(200),
  type: z.enum(["initial", "follow_up", "control", "sports", "other"]),
  startsAt: dateTime,
  endsAt: dateTime,
  timeZone: z.string().trim().min(1).max(80).default("America/La_Paz"),
  location: z.string().trim().max(300).nullable().optional().default(null),
  notes: z.string().trim().max(2000).nullable().optional().default(null),
}).superRefine((value, context) => {
  if (new Date(value.startsAt) >= new Date(value.endsAt)) {
    context.addIssue({ code: "custom", path: ["endsAt"], message: "El fin debe ser posterior al inicio." });
  }
  if (new Date(value.endsAt) - new Date(value.startsAt) > 8 * 60 * 60 * 1000) {
    context.addIssue({ code: "custom", path: ["endsAt"], message: "Una cita no puede durar más de 8 horas." });
  }
});

export const statusInput = z.object({
  status: z.enum(["scheduled", "confirmed", "completed", "cancelled", "no_show"]),
  reason: z.string().trim().min(2).max(500).nullable().optional().default(null),
  expectedVersion: z.number().int().positive(),
});

export const rescheduleInput = z.object({
  startsAt: dateTime,
  endsAt: dateTime,
  timeZone: z.string().trim().min(1).max(80).default("America/La_Paz"),
  reason: z.string().trim().min(2).max(500),
  expectedVersion: z.number().int().positive(),
}).superRefine((value, context) => {
  if (new Date(value.startsAt) >= new Date(value.endsAt)) {
    context.addIssue({ code: "custom", path: ["endsAt"], message: "El fin debe ser posterior al inicio." });
  }
  if (new Date(value.endsAt) - new Date(value.startsAt) > 8 * 60 * 60 * 1000) {
    context.addIssue({ code: "custom", path: ["endsAt"], message: "Una cita no puede durar más de 8 horas." });
  }
});

export const availabilityRuleInput = z.object({
  weekday: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timeZone: z.string().trim().min(1).max(80).default("America/La_Paz"),
  slotMinutes: z.number().int().min(5).max(480).default(30),
}).refine((value) => value.startTime < value.endTime, {
  path: ["endTime"],
  message: "La hora final debe ser posterior a la inicial.",
});

export const availabilityExceptionInput = z.object({
  startsAt: dateTime,
  endsAt: dateTime,
  available: z.boolean(),
  reason: z.string().trim().max(300).nullable().optional().default(null),
}).refine((value) => new Date(value.startsAt) < new Date(value.endsAt), {
  path: ["endsAt"],
  message: "El fin debe ser posterior al inicio.",
});

export const dateRange = z.object({
  from: dateTime,
  to: dateTime,
}).refine((value) => new Date(value.from) < new Date(value.to), {
  path: ["to"],
  message: "El rango es inválido.",
});

export const resource = Object.freeze({
  label: "cita",
  path: "/v1/appointments",
  eventPrefix: "scheduling",
});
