import { withAuth } from "@/lib/api";
import { markAllRead } from "@/lib/notifications";

export const POST = withAuth(async ({ user }) => markAllRead(user.id));
