import { z } from "zod";

export const supportCaseCategorySchema = z.enum(["ACADEMIC", "ATTENDANCE", "BEHAVIOR", "WELLBEING", "OTHER"]);
export const supportCaseStatusSchema = z.enum(["OPEN", "ASSIGNED", "IN_PROGRESS", "FOLLOW_UP", "RESOLVED"]);

export const createSupportCaseSchema = z.object({
  studentId: z.string().min(1),
  category: supportCaseCategorySchema.default("OTHER"),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(10000).optional().nullable(),
  isSensitive: z.boolean().default(false),
  assignedToUserId: z.string().optional().nullable(),
  followUpDate: z.coerce.date().optional().nullable(),
});
export type CreateSupportCaseInput = z.infer<typeof createSupportCaseSchema>;

export const updateSupportCaseSchema = createSupportCaseSchema.omit({ studentId: true, assignedToUserId: true }).partial();
export type UpdateSupportCaseInput = z.infer<typeof updateSupportCaseSchema>;

export const addSupportCaseNoteSchema = z.object({
  body: z.string().trim().min(1).max(10000),
  followUpDate: z.coerce.date().optional().nullable(),
});
export type AddSupportCaseNoteInput = z.infer<typeof addSupportCaseNoteSchema>;

export const assignSupportCaseSchema = z.object({
  assignedToUserId: z.string().min(1),
});
export type AssignSupportCaseInput = z.infer<typeof assignSupportCaseSchema>;

export const supportCaseStatusChangeSchema = z.object({
  status: supportCaseStatusSchema,
});
export type SupportCaseStatusChangeInput = z.infer<typeof supportCaseStatusChangeSchema>;

export const listSupportCasesSchema = z.object({
  studentId: z.string().optional(),
  status: supportCaseStatusSchema.optional(),
  category: supportCaseCategorySchema.optional(),
  assignedToUserId: z.string().optional(),
});
export type ListSupportCasesQuery = z.infer<typeof listSupportCasesSchema>;
