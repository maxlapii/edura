import { z } from "zod";

export const createSubjectSchema = z.object({
  name: z.string().trim().min(1).max(80),
  code: z.string().trim().min(1).max(20).transform((s) => s.toUpperCase()),
  departmentId: z.string().optional().nullable(),
  schoolId: z.string().optional(),
});
export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;
export const updateSubjectSchema = createSubjectSchema.omit({ schoolId: true }).partial();
export type UpdateSubjectInput = z.infer<typeof updateSubjectSchema>;
