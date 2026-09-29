import { withAuth, parseBody } from "@/lib/api";
import { testRule, testRuleSchema } from "@/modules/workflows";

export const POST = withAuth(async ({ req, user, params }) => testRule(user, params.id, await parseBody(req, testRuleSchema)), { permission: "workflows:manage" });
