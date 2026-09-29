import { withAuth } from "@/lib/api";
import { getMessage } from "@/modules/communication";

export const GET = withAuth(async ({ user, params }) => getMessage(user, params.id), { permission: "messages:read" });
