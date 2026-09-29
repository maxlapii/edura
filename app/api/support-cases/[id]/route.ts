import { withAuth, parseBody } from "@/lib/api";
import { getSupportCase, updateSupportCase, updateSupportCaseSchema } from "@/modules/supportCases";

export const GET = withAuth(async ({ user, params }) => getSupportCase(user, params.id), { permission: "support_cases:read" });

export const PATCH = withAuth(async ({ req, user, params }) => updateSupportCase(user, params.id, await parseBody(req, updateSupportCaseSchema)), { permission: "support_cases:manage" });
