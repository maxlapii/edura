import { withAuth, parseBody } from "@/lib/api";
import { completeMeeting, completeMeetingSchema } from "@/modules/meetings";

export const POST = withAuth(async ({ req, user, params }) => completeMeeting(user, params.id, await parseBody(req, completeMeetingSchema)), { permission: "meetings:manage" });
