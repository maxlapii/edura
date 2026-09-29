import { withAuth, parseBody, parseQuery, created } from "@/lib/api";
import { createMaintenanceSchema, createRequest, listMaintenanceSchema, listRequests } from "@/modules/facilities";

export const GET = withAuth(async ({ req, user }) => listRequests(user, parseQuery(req, listMaintenanceSchema)), { permission: "maintenance:report" });

export const POST = withAuth(async ({ req, user }) => created(await createRequest(user, await parseBody(req, createMaintenanceSchema))), { permission: "maintenance:report" });
