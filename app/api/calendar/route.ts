import { withAuth, parseQuery } from "@/lib/api";
import { calendarQuerySchema, getCalendar } from "@/modules/calendar";

export const GET = withAuth(async ({ req, user }) => getCalendar(user, parseQuery(req, calendarQuerySchema)), { permission: "calendar:read" });
