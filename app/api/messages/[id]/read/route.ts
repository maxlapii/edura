import { withAuth } from "@/lib/api";
import { markRead } from "@/modules/communication";

export const POST = withAuth(async ({ user, params }) => markRead(user, params.id), { permission: "messages:read" });
