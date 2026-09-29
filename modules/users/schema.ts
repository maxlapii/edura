import { z } from "zod";
import { emailSchema, passwordSchema, searchSchema } from "@/lib/validation";

export const roleSchema = z.enum(["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "DEPARTMENT_HEAD", "TEACHER", "STUDENT", "PARENT", "STAFF"]);

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  password: passwordSchema.optional(),
  role: roleSchema,
  schoolId: z.string().optional(),
  phone: z.string().trim().max(40).optional().nullable(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: emailSchema.optional(),
  role: roleSchema.optional(),
  phone: z.string().trim().max(40).optional().nullable(),
  isActive: z.boolean().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const listUsersSchema = searchSchema.extend({
  role: roleSchema.optional(),
  isActive: z.enum(["true", "false"]).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export const setPasswordSchema = z.object({ password: passwordSchema });
