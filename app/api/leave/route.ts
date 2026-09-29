import { withAuth, parseBody, parseQuery, created } from "@/lib/api";
import { createLeaveRequest, createLeaveRequestSchema, listLeaveRequests, listLeaveSchema } from "@/modules/leave";

export const GET = withAuth(async ({ req, user }) => listLeaveRequests(user, parseQuery(req, listLeaveSchema)));

export const POST = withAuth(async ({ req, user }) => created(await createLeaveRequest(user, await parseBody(req, createLeaveRequestSchema))), { permission: "leave:request" });
