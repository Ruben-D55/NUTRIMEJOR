import { z } from "zod";

export const patientId = z.string().uuid();
export const templateInput = z.object({
  name: z.string().trim().min(2).max(200),
  documentType: z.enum(["meal_plan", "progress_report", "clinical_summary", "recommendations"]),
  definition: z.object({
    organizationName: z.string().trim().max(200).optional(),
    primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#1F7A5A"),
    footer: z.string().trim().max(300).optional(),
  }),
});

const section = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), text: z.string().trim().min(1).max(300) }),
  z.object({ type: z.literal("paragraph"), text: z.string().trim().min(1).max(10000) }),
  z.object({
    type: z.literal("key_value"),
    items: z.array(z.object({
      label: z.string().trim().min(1).max(100),
      value: z.string().trim().max(500),
    })).min(1).max(100),
  }),
  z.object({
    type: z.literal("table"),
    columns: z.array(z.string().trim().min(1).max(80)).min(1).max(8),
    rows: z.array(z.array(z.union([z.string(), z.number()]))).max(200),
  }),
]);

export const generationInput = z.object({
  patientId,
  title: z.string().trim().min(2).max(200),
  documentType: z.enum(["meal_plan", "progress_report", "clinical_summary", "recommendations"]),
  templateId: z.string().uuid().nullable().optional().default(null),
  patientDisplayName: z.string().trim().min(1).max(250),
  issuedAt: z.iso.datetime({ offset: true }).optional(),
  sections: z.array(section).min(1).max(100),
});

export const accessInput = z.object({
  expiresInMinutes: z.number().int().min(1).max(60).default(15),
});
