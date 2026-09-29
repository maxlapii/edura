import { z } from "zod";
import { withAuth, parseQuery } from "@/lib/api";
import { countUnread, listNotifications } from "@/lib/notifications";

const querySchema = z.object({ unreadOnly: z.enum(["true", "false"]).optional() });

export const GET = withAuth(async ({ req, user }) => {
  const query = parseQuery(req, querySchema);
  const items = await listNotifications(user.id, { unreadOnly: query.unreadOnly === "true" });
  return { items, unread: await countUnread(user.id) };
});
