import { z } from "zod";
import { withAuth, parseQuery } from "@/lib/api";
import { dateOnlySchema } from "@/lib/validation";
import { pendingAttendanceForTeacher } from "@/modules/attendance";

const querySchema = z.object({ date: dateOnlySchema.optional() });

export const GET = withAuth(async ({ req, user }) => {
  if (!user.teacherId) return [];
  return pendingAttendanceForTeacher(user.teacherId, parseQuery(req, querySchema).date ?? new Date());
});
