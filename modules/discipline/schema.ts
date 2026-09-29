import { z } from "zod";
import { dateOnlySchema } from "@/lib/validation";

export const severitySchema = z.enum(["MINOR", "MODERATE", "MAJOR", "SEVERE"]);

export const createIncidentSchema = z.object({
  studentId: z.string().min(1),
  category: z.string().trim().min(1).max(80),
  date: dateOnlySchema,
  severity: severitySchema.default("MINOR"),
  description: z.string().trim().min(1).max(10000),
  actions: z.string().trim().max(5000).optional().nullable(),
  parentNotified: z.boolean().default(false),
  followUp: z.string().trim().max(5000).optional().nullable(),
});
export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;

export const updateIncidentSchema = createIncidentSchema.omit({ studentId: true }).partial();
export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>;

export const listIncidentsSchema = z.object({
  studentId: z.string().optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  severity: severitySchema.optional(),
});
export type ListIncidentsQuery = z.infer<typeof listIncidentsSchema>;
