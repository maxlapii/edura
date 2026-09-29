import { withAuth, parseBody } from "@/lib/api";
import { getIncident, updateIncident, updateIncidentSchema } from "@/modules/discipline";

export const GET = withAuth(async ({ user, params }) => getIncident(user, params.id));

export const PATCH = withAuth(async ({ req, user, params }) => updateIncident(user, params.id, await parseBody(req, updateIncidentSchema)), { permission: "discipline:manage" });
