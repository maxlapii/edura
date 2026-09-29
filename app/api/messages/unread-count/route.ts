import { withAuth } from "@/lib/api";
import { unreadCount } from "@/modules/communication";

export const GET = withAuth(async ({ user }) => ({ count: await unreadCount(user.id) }), { permission: "messages:read" });
