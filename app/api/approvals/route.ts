import { withAuth, parseQuery } from "@/lib/api";
import { listApprovals, listApprovalsSchema } from "@/modules/approvals";

/** Approvers see the school's queue (scope=all, default); requesters see their own (scope=mine). */
export const GET = withAuth(async ({ req, user }) => listApprovals(user, parseQuery(req, listApprovalsSchema)));
