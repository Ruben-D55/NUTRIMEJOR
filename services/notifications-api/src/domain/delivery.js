import { z } from "zod";

export const patientId = z.string().uuid();
export const preferenceInput = z.object({
  patientId,
  channel: z.enum(["in_app", "email", "sms", "whatsapp"]),
  recipient: z.string().trim().min(1).max(320),
  enabled: z.boolean().default(true),
  reminderMinutes: z.number().int().min(0).max(43200).default(1440),
});

export const notificationInput = z.object({
  patientId: patientId.nullable().optional().default(null),
  title: z.string().trim().min(2).max(200),
  templateCode: z.string().trim().min(2).max(80).default("MANUAL"),
  channel: z.enum(["in_app", "email", "sms", "whatsapp"]),
  recipient: z.string().trim().min(1).max(320),
  subject: z.string().trim().max(300).nullable().optional().default(null),
  body: z.string().trim().min(1).max(10000),
  scheduledAt: z.iso.datetime({ offset: true }).optional(),
  maxAttempts: z.number().int().min(1).max(10).default(3),
});

export const alertRuleInput = z.object({
  name: z.string().trim().min(2).max(200),
  ruleType: z.enum([
    "patient_without_follow_up", "upcoming_appointment", "expiring_meal_plan",
    "missed_appointment", "incomplete_patient_data", "pending_lab",
    "pending_anthropometry", "pending_review",
  ]),
  conditions: z.record(z.string(), z.unknown()).optional().default({}),
  channels: z.array(z.enum(["in_app", "email", "sms", "whatsapp"])).min(1).max(4),
  leadMinutes: z.number().int().min(0).max(525600).default(0),
  enabled: z.boolean().default(true),
});
