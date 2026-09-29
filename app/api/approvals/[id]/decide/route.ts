import { withAuth, parseBody } from "@/lib/api";
import { decideApproval, decideApprovalSchema } from "@/modules/approvals";

export const POST = withAuth(async ({ req, user, params }) => decideApproval(user, params.id, await parseBody(req, decideApprovalSchema)), { permission: "approvals:decide" });
