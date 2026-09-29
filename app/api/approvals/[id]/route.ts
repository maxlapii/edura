import { withAuth } from "@/lib/api";
import { getApproval } from "@/modules/approvals";

export const GET = withAuth(async ({ user, params }) => getApproval(user, params.id));
