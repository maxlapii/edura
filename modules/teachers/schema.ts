import { z } from "zod";
import { dateOnlySchema, dayOfWeekSchema, emailSchema, passwordSchema, searchSchema } from "@/lib/validation";

export const teacherStatusSchema = z.enum(["ACTIVE", "ON_LEAVE", "SUSPENDED", "INACTIVE"]);
export const employmentTypeSchema = z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "SUBSTITUTE"]);

export const createTeacherSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  password: passwordSchema.optional(),
  phone: z.string().trim().max(40).optional().nullable(),
  employeeNumber: z.string().trim().min(1).max(30),
  employmentType: employmentTypeSchema.default("FULL_TIME"),
  hireDate: dateOnlySchema.optional().nullable(),
  departmentId: z.string().optional().nullable(),
  position: z.string().trim().max(80).optional().nullable(),
  qualifications: z.array(z.string().trim().min(1).max(120)).default([]),
  bio: z.string().trim().max(2000).optional().nullable(),
  emergencyContactName: z.string().trim().max(120).optional().nullable(),
  emergencyContactPhone: z.string().trim().max(40).optional().nullable(),
  maxWeeklyPeriods: z.coerce.number().int().min(1).max(60).default(25),
  subjectIds: z.array(z.string()).default([]),
  schoolId: z.string().optional(),
});
export type CreateTeacherInput = z.infer<typeof createTeacherSchema>;

export const updateTeacherSchema = createTeacherSchema
  .omit({ email: true, password: true, schoolId: true })
  .partial()
  .extend({ status: teacherStatusSchema.optional() });
export type UpdateTeacherInput = z.infer<typeof updateTeacherSchema>;

export const listTeachersSchema = searchSchema.extend({
  departmentId: z.string().optional(),
  status: teacherStatusSchema.optional(),
  subjectId: z.string().optional(),
});

export const availabilitySchema = z.object({
  dayOfWeek: dayOfWeekSchema,
  periodId: z.string().optional().nullable(),
  type: z.enum(["AVAILABLE", "UNAVAILABLE", "PREFERRED", "PREFERRED_SUBSTITUTION"]),
  note: z.string().trim().max(200).optional().nullable(),
});
export const setAvailabilitySchema = z.object({ entries: z.array(availabilitySchema).max(200) });

export const dutySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  dayOfWeek: dayOfWeekSchema.optional().nullable(),
  periodId: z.string().optional().nullable(),
  weeklyHours: z.coerce.number().min(0).max(40).default(1),
});

export const certificationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  issuer: z.string().trim().max(120).optional().nullable(),
  issuedAt: dateOnlySchema.optional().nullable(),
  expiresAt: dateOnlySchema.optional().nullable(),
});

export const professionalDevelopmentSchema = z.object({
  type: z.enum(["TRAINING", "WORKSHOP", "COURSE", "OBSERVATION", "GOAL", "DEVELOPMENT_PLAN"]).default("TRAINING"),
  title: z.string().trim().min(1).max(160),
  date: dateOnlySchema.optional().nullable(),
  hours: z.coerce.number().min(0).max(1000).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(["PLANNED", "IN_PROGRESS", "COMPLETED"]).default("PLANNED"),
});
