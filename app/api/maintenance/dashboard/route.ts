import { withAuth } from "@/lib/api";
import { getMaintenanceDashboard } from "@/modules/facilities";

export const GET = withAuth(async ({ user }) => getMaintenanceDashboard(user), { permission: "maintenance:manage" });
