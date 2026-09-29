import { z } from "zod";
import { withAuth, parseBody, parseQuery, created } from "@/lib/api";
import { dayOfWeekSchema } from "@/lib/validation";
import { createSlot, createSlotSchema, weeklySchedule } from "@/modules/timetable";

const scheduleFilterSchema = z.object({
  teacherId: z.string().optional(),
  classId: z.string().optional(),
  roomId: z.string().optional(),
  dayOfWeek: dayOfWeekSchema.optional(),
});

export const GET = withAuth(async ({ req, user }) => weeklySchedule(user, parseQuery(req, scheduleFilterSchema)), { permission: "timetable:read" });

export const POST = withAuth(async ({ req, user }) => created(await createSlot(user, await parseBody(req, createSlotSchema))), { permission: "timetable:manage" });
