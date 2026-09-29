import { z } from "zod";
import { withAuth, parseQuery } from "@/lib/api";
import { dateOnlySchema } from "@/lib/validation";
import { studentAttendanceSummary } from "@/modules/attendance";

const rangeSchema = z.object({ from: dateOnlySchema.optional(), to: dateOnlySchema.optional() });

export const GET = withAuth(async ({ req, user, params }) => studentAttendanceSummary(user, params.id, parseQuery(req, rangeSchema)), { permission: "attendance:read" });
