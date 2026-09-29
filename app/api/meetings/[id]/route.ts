import { withAuth, parseBody } from "@/lib/api";
import { cancelMeeting, getMeeting, updateMeeting, updateMeetingSchema } from "@/modules/meetings";

export const GET = withAuth(async ({ user, params }) => getMeeting(user, params.id), { permission: "meetings:read" });

export const PATCH = withAuth(async ({ req, user, params }) => updateMeeting(user, params.id, await parseBody(req, updateMeetingSchema)), { permission: "meetings:manage" });

export const DELETE = withAuth(async ({ user, params }) => cancelMeeting(user, params.id), { permission: "meetings:manage" });
