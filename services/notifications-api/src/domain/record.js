import { z } from "zod";

export const recordId = z.string().uuid();

export const recordInput = z.object({
  patientId: z.string().uuid().nullable().optional().default(null),
  title: z.string().trim().min(2).max(200),
  status: z.string().trim().min(2).max(30).optional().default("draft"),
  data: z.record(z.string(), z.unknown()).optional().default({}),
});

export const statusInput = z.object({
  status: z.string().trim().min(2).max(30),
});

export const resource = Object.freeze({
  label: "notificación",
  path: "/v1/notifications",
  eventPrefix: "notifications",
});
