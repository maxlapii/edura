import { withAuth, parseBody, noContent } from "@/lib/api";
import { deleteTemplate, updateMessageTemplateSchema, updateTemplate } from "@/modules/communication";

export const PATCH = withAuth(async ({ req, user, params }) => updateTemplate(user, params.id, await parseBody(req, updateMessageTemplateSchema)), { permission: "messages:send" });

export const DELETE = withAuth(
  async ({ user, params }) => {
    await deleteTemplate(user, params.id);
    return noContent();
  },
  { permission: "messages:send" },
);
