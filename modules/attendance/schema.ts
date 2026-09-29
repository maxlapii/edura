import { z } from "zod";
import { dateOnlySchema } from "@/lib/validation";

export const attendanceStatusSchema = z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]);

export const openSessionSchema = z.object({
  courseId: z.string().min(1),
  date: dateOnlySchema,
  periodId: z.string().optional().nullable(),
  timetableSlotId: z.string().optional().nullable(),
});
export type OpenSessionInput = z.infer<typeof openSessionSchema>;

export const recordAttendanceSchema = z.object({
  /** When true, every student in the roster not listed in `records` is marked PRESENT. */
  markAllPresent: z.boolean().default(true),
  records: z
    .array(
      z.object({
        studentId: z.string().min(1),
        status: attendanceStatusSchema,
        note: z.string().trim().max(300).optional().nullable(),
        minutesLate: z.coerce.number().int().min(0).max(600).optional().nullable(),
      }),
    )
    .max(500),
  submit: z.boolean().default(true),
});
export type RecordAttendanceInput = z.infer<typeof recordAttendanceSchema>;

export const attendanceQuerySchema = z.object({
  courseId: z.string().optional(),
  classId: z.string().optional(),
  studentId: z.string().optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
});
