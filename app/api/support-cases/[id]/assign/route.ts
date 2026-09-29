import { withAuth, parseBody } from "@/lib/api";
import { assignSupportCase, assignSupportCaseSchema } from "@/modules/supportCases";

export const POST = withAuth(async ({ req, user, params }) => assignSupportCase(user, params.id, await parseBody(req, assignSupportCaseSchema)), { permission: "support_cases:manage" });
