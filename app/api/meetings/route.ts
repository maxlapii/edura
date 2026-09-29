import { withAuth, parseBody, parseQuery, created } from "@/lib/api";
import { createMeeting, createMeetingSchema, listMeetings, listMeetingsSchema } from "@/modules/meetings";

export const GET = withAuth(async ({ req, user }) => listMeetings(user, parseQuery(req, listMeetingsSchema)), { permission: "meetings:read" });

export const POST = withAuth(async ({ req, user }) => created(await createMeeting(user, await parseBody(req, createMeetingSchema))), { permission: "meetings:manage" });
