import { withAuth, parseBody, parseQuery, created } from "@/lib/api";
import { listMessages, listMessagesSchema, sendMessage, sendMessageSchema } from "@/modules/communication";

export const GET = withAuth(async ({ req, user }) => listMessages(user, parseQuery(req, listMessagesSchema)), { permission: "messages:read" });

export const POST = withAuth(async ({ req, user }) => created(await sendMessage(user, await parseBody(req, sendMessageSchema))), { permission: "messages:send" });
