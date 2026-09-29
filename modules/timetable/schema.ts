import { z } from "zod";
import { dateOnlySchema, dayOfWeekSchema, timeSchema } from "@/lib/validation";

export const createSlotSchema = z.object({
  courseId: z.string().min(1),
  dayOfWeek: dayOfWeekSchema,
  periodId: z.string().min(1),
  roomId: z.string().optional().nullable(),
});
export type CreateSlotInput = z.infer<typeof createSlotSchema>;

export const bulkSlotsSchema = z.object({ slots: z.array(createSlotSchema).min(1).max(500) });

export const updateSlotSchema = createSlotSchema.partial();

export const periodSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    order: z.coerce.number().int().min(1).max(30),
    startTime: timeSchema,
    endTime: timeSchema,
  })
  .refine((p) => p.startTime < p.endTime, { message: "startTime must be before endTime", path: ["endTime"] });

export const scheduleQuerySchema = z.object({
  date: dateOnlySchema.optional(),
  teacherId: z.string().optional(),
  classId: z.string().optional(),
  roomId: z.string().optional(),
});
