import { withAuth, parseBody } from "@/lib/api";
import { draftParentMessageSchema, draftParentMessage } from "@/modules/ai";

export const POST = withAuth(async ({ req, user }) => draftParentMessage(user, await parseBody(req, draftParentMessageSchema)), { permission: ["ai:teacher", "ai:admin"] });
