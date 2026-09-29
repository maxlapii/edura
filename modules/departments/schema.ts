import { z } from "zod";

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(2).max(80),
  code: z.string().trim().min(1).max(20).transform((s) => s.toUpperCase()),
  description: z.string().trim().max(500).optional().nullable(),
  headTeacherId: z.string().optional().nullable(),
  schoolId: z.string().optional(),
});
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export const updateDepartmentSchema = createDepartmentSchema.omit({ schoolId: true }).partial();
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
