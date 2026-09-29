import { z } from "zod";
import { withAuth, parseBody, noContent } from "@/lib/api";
import { timeSchema } from "@/lib/validation";
import { deletePeriod, updatePeriod } from "@/modules/timetable";

/** `periodSchema` carries a `.refine`, so a partial variant is declared here. */
const periodUpdateSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  order: z.coerce.number().int().min(1).max(30).optional(),
  startTime: timeSchema.optional(),
  endTime: timeSchema.optional(),
});

export const PATCH = withAuth(async ({ req, user, params }) => updatePeriod(user, params.id, await parseBody(req, periodUpdateSchema)), { permission: "timetable:manage" });

export const DELETE = withAuth(async ({ user, params }) => {
  await deletePeriod(user, params.id);
  return noContent();
}, { permission: "timetable:manage" });
