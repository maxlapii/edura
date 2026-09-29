import { withAuth } from "@/lib/api";
import { dashboardForUser } from "@/modules/dashboards";

export const GET = withAuth(async ({ user }) => dashboardForUser(user));
