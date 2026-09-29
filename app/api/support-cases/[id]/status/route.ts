import { withAuth, parseBody } from "@/lib/api";
import { supportCaseStatusChangeSchema, updateSupportCaseStatus } from "@/modules/supportCases";

export const POST = withAuth(async ({ req, user, params }) => updateSupportCaseStatus(user, params.id, await parseBody(req, supportCaseStatusChangeSchema)), { permission: "support_cases:manage" });
