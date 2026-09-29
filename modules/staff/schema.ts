import { z } from "zod";
import { emailSchema, passwordSchema, searchSchema } from "@/lib/validation";

export const staffTypeSchema = z.enum(["ADMINISTRATIVE", "RECEPTION", "IT", "MAINTENANCE", "LIBRARIAN", "COORDINATOR", "SUPPORT", "OTHER"]);
export const staffStatusSchema = z.enum(["ACTIVE", "ON_LEAVE", "INACTIVE"]);

export const createStaffSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  password: passwordSchema.optional(),
  phone: z.string().trim().max(40).optional().nullable(),
  employeeNumber: z.string().trim().min(1).max(30),
  staffType: staffTypeSchema.default("OTHER"),
  departmentId: z.string().optional().nullable(),
  position: z.string().trim().max(80).optional().nullable(),
  workSchedule: z.record(z.string(), z.unknown()).optional().nullable(),
  /** Administrative staff can be given an admin role. */
  role: z.enum(["STAFF", "SCHOOL_ADMIN", "PRINCIPAL"]).default("STAFF"),
  schoolId: z.string().optional(),
});
export type CreateStaffInput = z.infer<typeof createStaffSchema>;

export const updateStaffSchema = createStaffSchema.omit({ email: true, password: true, schoolId: true, role: true }).partial().extend({ status: staffStatusSchema.optional() });
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;

export const listStaffSchema = searchSchema.extend({ staffType: staffTypeSchema.optional(), status: staffStatusSchema.optional(), schoolId: z.string().optional() });
