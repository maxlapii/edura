import { withAuth, parseBody } from "@/lib/api";
import { meetingSummarySchema, summarizeMeeting } from "@/modules/ai";

export const POST = withAuth(async ({ req, user }) => summarizeMeeting(user, await parseBody(req, meetingSummarySchema)), { permission: ["ai:teacher", "ai:admin"] });
