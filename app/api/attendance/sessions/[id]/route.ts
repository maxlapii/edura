import { withAuth, parseBody } from "@/lib/api";
import { getSession, recordAttendance, recordAttendanceSchema } from "@/modules/attendance";

export const GET = withAuth(async ({ user, params }) => getSession(user, params.id), { permission: "attendance:read" });

export const PUT = withAuth(async ({ req, user, params }) => recordAttendance(user, params.id, await parseBody(req, recordAttendanceSchema)), { permission: "attendance:record" });
