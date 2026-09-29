import { withAuth } from "@/lib/api";
import { resetDefaults } from "@/modules/workflows";

export const POST = withAuth(async ({ user }) => resetDefaults(user), { permission: "workflows:manage" });
