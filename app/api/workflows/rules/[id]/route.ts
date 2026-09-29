import { withAuth, parseBody, noContent } from "@/lib/api";
import { deleteRule, getRule, updateRule, updateRuleSchema } from "@/modules/workflows";

export const GET = withAuth(async ({ user, params }) => getRule(user, params.id), { permission: "workflows:manage" });

export const PATCH = withAuth(async ({ req, user, params }) => updateRule(user, params.id, await parseBody(req, updateRuleSchema)), { permission: "workflows:manage" });

export const DELETE = withAuth(
  async ({ user, params }) => {
    await deleteRule(user, params.id);
    return noContent();
  },
  { permission: "workflows:manage" },
);
