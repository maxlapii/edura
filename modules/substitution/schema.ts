import { z } from "zod";
import { dateOnlySchema } from "@/lib/validation";

export const assignSubstituteSchema = z.object({
  substituteTeacherId: z.string().min(1),
  note: z.string().trim().max(500).optional().nullable(),
});

export const createSubstitutionSchema = z.object({
  timetableSlotId: z.string().min(1),
  date: dateOnlySchema,
  leaveRequestId: z.string().optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
});

export const listSubstitutionsSchema = z.object({
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  status: z.enum(["PENDING", "ASSIGNED", "DECLINED", "COMPLETED", "CANCELLED"]).optional(),
  teacherId: z.string().optional(),
});
