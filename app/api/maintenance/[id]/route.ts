import { withAuth, parseBody } from "@/lib/api";
import { getRequest, updateMaintenanceSchema, updateRequest } from "@/modules/facilities";

export const GET = withAuth(async ({ user, params }) => getRequest(user, params.id), { permission: "maintenance:report" });

export const PATCH = withAuth(async ({ req, user, params }) => updateRequest(user, params.id, await parseBody(req, updateMaintenanceSchema)), { permission: "maintenance:report" });
