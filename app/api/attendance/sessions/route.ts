import { z } from "zod";
import { withAuth, parseBody, parseQuery, created } from "@/lib/api";
import { dateOnlySchema } from "@/lib/validation";
import { listSessions, openSession, openSessionSchema } from "@/modules/attendance";

const listQuerySchema = z.object({
  courseId: z.string().optional(),
  classId: z.string().optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
});

export const GET = withAuth(async ({ req, user }) => listSessions(user, parseQuery(req, listQuerySchema)), { permission: "attendance:read" });

export const POST = withAuth(async ({ req, user }) => created(await openSession(user, await parseBody(req, openSessionSchema))), { permission: "attendance:record" });
