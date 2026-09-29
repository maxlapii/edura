import { withAuth, parseBody } from "@/lib/api";
import { maintenanceStatusChangeSchema, updateStatus } from "@/modules/facilities";

export const POST = withAuth(async ({ req, user, params }) => updateStatus(user, params.id, await parseBody(req, maintenanceStatusChangeSchema)), { permission: "maintenance:report" });
