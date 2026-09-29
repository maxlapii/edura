import { z } from "zod";
import { emailSchema, passwordSchema, searchSchema } from "@/lib/validation";

export const createGuardianSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  password: passwordSchema.optional(),
  phone: z.string().trim().max(40).optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
  studentIds: z.array(z.string()).default([]),
  relationship: z.string().trim().max(40).default("PARENT"),
  schoolId: z.string().optional(),
});
export type CreateGuardianInput = z.infer<typeof createGuardianSchema>;

export const updateGuardianSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(40).optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
});

export const linkStudentSchema = z.object({
  studentId: z.string().min(1),
  relationship: z.string().trim().max(40).default("PARENT"),
  isPrimary: z.boolean().default(false),
});

export const listGuardiansSchema = searchSchema;
