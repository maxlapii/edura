import { withAuth, parseQuery } from "@/lib/api";
import { renderTemplateForStudent, renderTemplateQuerySchema } from "@/modules/communication";

export const GET = withAuth(async ({ req, user, params }) => renderTemplateForStudent(user, params.id, parseQuery(req, renderTemplateQuerySchema).studentId), { permission: "messages:send" });
