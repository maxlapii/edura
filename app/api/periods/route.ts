import { z } from "zod";
import { withAuth, parseBody, parseQuery, created } from "@/lib/api";
import { createPeriod, listPeriods, periodSchema } from "@/modules/timetable";

const listQuerySchema = z.object({ schoolId: z.string().optional() });

export const GET = withAuth(async ({ req, user }) => listPeriods(user, parseQuery(req, listQuerySchema).schoolId), { permission: "timetable:read" });

export const POST = withAuth(async ({ req, user }) => created(await createPeriod(user, await parseBody(req, periodSchema))), { permission: "timetable:manage" });
