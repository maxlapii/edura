import { withAuth, parseBody, parseQuery, created } from "@/lib/api";
import { createRule, createRuleSchema, listRules, listRulesSchema } from "@/modules/workflows";

export const GET = withAuth(async ({ req, user }) => listRules(user, parseQuery(req, listRulesSchema)), { permission: "workflows:manage" });

export const POST = withAuth(async ({ req, user }) => created(await createRule(user, await parseBody(req, createRuleSchema))), { permission: "workflows:manage" });
