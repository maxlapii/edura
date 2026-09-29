import { z } from "zod";
import { withAuth, parseQuery } from "@/lib/api";
import { dateOnlySchema } from "@/lib/validation";
import { teacherDaySchedule } from "@/modules/timetable";

const querySchema = z.object({ date: dateOnlySchema.optional() });

export const GET = withAuth(
  async ({ req, user, params }) => teacherDaySchedule(user, params.id, parseQuery(req, querySchema).date ?? new Date()),
  { permission: "timetable:read" },
);
