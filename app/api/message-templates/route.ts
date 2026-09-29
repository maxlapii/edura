import { withAuth, parseBody, parseQuery, created } from "@/lib/api";
import { createTemplate, listMessageTemplatesSchema, listTemplates, messageTemplateSchema } from "@/modules/communication";

export const GET = withAuth(async ({ req, user }) => listTemplates(user, parseQuery(req, listMessageTemplatesSchema)), { permission: "messages:send" });

export const POST = withAuth(async ({ req, user }) => created(await createTemplate(user, await parseBody(req, messageTemplateSchema))), { permission: "messages:send" });
