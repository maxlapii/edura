import { withAuth, parseBody } from "@/lib/api";
import { reviewLeaveRequest, reviewLeaveSchema } from "@/modules/leave";

export const POST = withAuth(async ({ req, user, params }) => {
  const body = await parseBody(req, reviewLeaveSchema);
  return reviewLeaveRequest(user, params.id, body.action, body.comment);
}, { permission: "leave:review" });
