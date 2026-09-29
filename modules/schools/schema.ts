import { z } from "zod";

export const createSchoolSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9_-]+$/).transform((s) => s.toUpperCase()),
  address: z.string().trim().max(300).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().email().optional().nullable(),
  timezone: z.string().trim().max(60).default("UTC"),
});
export type CreateSchoolInput = z.infer<typeof createSchoolSchema>;

export const updateSchoolSchema = createSchoolSchema.partial().extend({
  isActive: z.boolean().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateSchoolInput = z.infer<typeof updateSchoolSchema>;

export const schoolSettingsSchema = z.object({
  absenceThreshold: z.number().int().min(1).max(60).default(3),
  absenceWindowDays: z.number().int().min(1).max(365).default(30),
  gradeSubmissionReminderDays: z.number().int().min(0).max(30).default(2),
  certificationExpiryWarningDays: z.number().int().min(1).max(365).default(30),
  maxWeeklyPeriods: z.number().int().min(1).max(60).default(25),
});
export type SchoolSettings = z.infer<typeof schoolSettingsSchema>;
