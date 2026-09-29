import { withAuth } from "@/lib/api";
import { cancelLeaveRequest, getLeaveRequest } from "@/modules/leave";

export const GET = withAuth(async ({ user, params }) => getLeaveRequest(user, params.id));

export const DELETE = withAuth(async ({ user, params }) => cancelLeaveRequest(user, params.id));
