import { z } from "zod";
import { dateOnlySchema, emailSchema, passwordSchema, searchSchema } from "@/lib/validation";

export const studentStatusSchema = z.enum(["ACTIVE", "INACTIVE", "GRADUATED", "TRANSFERRED"]);

export const createStudentSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  studentNumber: z.string().trim().min(1).max(30),
  dateOfBirth: dateOnlySchema.optional().nullable(),
  gender: z.string().trim().max(20).optional().nullable(),
  classId: z.string().optional().nullable(),
  enrollmentDate: dateOnlySchema.optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  medicalNotes: z.string().trim().max(2000).optional().nullable(),
  /** Optionally create a login for the student. */
  email: emailSchema.optional().nullable(),
  password: passwordSchema.optional(),
  schoolId: z.string().optional(),
});
export type CreateStudentInput = z.infer<typeof createStudentSchema>;

export const updateStudentSchema = createStudentSchema.omit({ email: true, password: true, schoolId: true }).partial().extend({ status: studentStatusSchema.optional() });
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;

export const listStudentsSchema = searchSchema.extend({
  classId: z.string().optional(),
  status: studentStatusSchema.optional(),
});
