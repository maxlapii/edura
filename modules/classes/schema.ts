import { z } from "zod";
import { searchSchema } from "@/lib/validation";

export const createClassSchema = z.object({
  academicYearId: z.string().min(1),
  name: z.string().trim().min(1).max(60),
  gradeLevel: z.coerce.number().int().min(0).max(20).optional().nullable(),
  homeroomTeacherId: z.string().optional().nullable(),
  roomId: z.string().optional().nullable(),
  capacity: z.coerce.number().int().min(1).max(500).optional().nullable(),
  schoolId: z.string().optional(),
});
export type CreateClassInput = z.infer<typeof createClassSchema>;
export const updateClassSchema = createClassSchema.omit({ schoolId: true, academicYearId: true }).partial();
export type UpdateClassInput = z.infer<typeof updateClassSchema>;

export const listClassesSchema = searchSchema.extend({
  academicYearId: z.string().optional(),
  gradeLevel: z.coerce.number().int().optional(),
});

export const assignStudentsSchema = z.object({
  studentIds: z.array(z.string().min(1)).min(1).max(500),
});

export const createCourseSchema = z.object({
  classId: z.string().min(1),
  subjectId: z.string().min(1),
  teacherId: z.string().min(1),
  name: z.string().trim().max(120).optional().nullable(),
});
export type CreateCourseInput = z.infer<typeof createCourseSchema>;

export const updateCourseSchema = z.object({
  teacherId: z.string().min(1).optional(),
  name: z.string().trim().max(120).optional().nullable(),
});
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
