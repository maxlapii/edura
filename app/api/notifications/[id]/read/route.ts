import { withAuth } from "@/lib/api";
import { markRead } from "@/lib/notifications";

export const POST = withAuth(async ({ user, params }) => markRead(user.id, params.id));
