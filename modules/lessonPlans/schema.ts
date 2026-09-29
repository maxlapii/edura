import { z } from "zod";
import { dateOnlySchema } from "@/lib/validation";

export const createLessonPlanSchema = z.object({
  courseId: z.string().min(1),
  title: z.string().trim().min(1).max(160),
  date: dateOnlySchema.optional().nullable(),
  timetableSlotId: z.string().optional().nullable(),
  curriculumTopic: z.string().trim().max(200).optional().nullable(),
  objectives: z.string().trim().max(5000).optional().nullable(),
  activities: z.string().trim().max(10000).optional().nullable(),
  materials: z.string().trim().max(5000).optional().nullable(),
  homework: z.string().trim().max(5000).optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
  status: z.enum(["DRAFT", "READY", "COMPLETED"]).default("DRAFT"),
  aiGenerated: z.boolean().default(false),
});
export type CreateLessonPlanInput = z.infer<typeof createLessonPlanSchema>;
export const updateLessonPlanSchema = createLessonPlanSchema.omit({ courseId: true }).partial();
export type UpdateLessonPlanInput = z.infer<typeof updateLessonPlanSchema>;

export const copyLessonPlanSchema = z.object({
  courseId: z.string().optional(),
  date: dateOnlySchema.optional().nullable(),
  title: z.string().trim().max(160).optional(),
});
