import { withAuth, parseBody } from "@/lib/api";
import { respondMeetingSchema, respondToMeeting } from "@/modules/meetings";

export const POST = withAuth(async ({ req, user, params }) => respondToMeeting(user, params.id, await parseBody(req, respondMeetingSchema)), { permission: "meetings:read" });
