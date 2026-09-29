import { z } from "zod";

const attachmentSchema = z.object({ name: z.string().min(1).max(200), url: z.string().url().max(2000) });

export const createAssignmentSchema = z.object({
  courseId: z.string().min(1),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(5000).optional().nullable(),
  dueDate: z.coerce.date(),
  maxScore: z.coerce.number().positive().max(10000).default(100),
  attachments: z.array(attachmentSchema).max(20).default([]),
  rubric: z.array(z.object({ criterion: z.string().min(1).max(200), points: z.number().min(0) })).max(30).optional().nullable(),
  status: z.enum(["DRAFT", "PUBLISHED", "CLOSED"]).default("PUBLISHED"),
});
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;

export const updateAssignmentSchema = createAssignmentSchema.omit({ courseId: true }).partial();
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;

export const submitAssignmentSchema = z.object({
  content: z.string().trim().max(20000).optional().nullable(),
  attachments: z.array(attachmentSchema).max(20).default([]),
});
export type SubmitAssignmentInput = z.infer<typeof submitAssignmentSchema>;

export const assignmentFilterSchema = z.object({
  courseId: z.string().optional(),
  filter: z.enum(["all", "missing", "submitted", "late", "graded", "overdue", "upcoming"]).default("all"),
});
export type AssignmentFilter = z.infer<typeof assignmentFilterSchema>["filter"];
