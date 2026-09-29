import { withAuth, parseBody } from "@/lib/api";
import { assignMaintenanceSchema, assignRequest } from "@/modules/facilities";

export const POST = withAuth(async ({ req, user, params }) => assignRequest(user, params.id, await parseBody(req, assignMaintenanceSchema)), { permission: "maintenance:manage" });
