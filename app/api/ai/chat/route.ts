import { withAuth, parseBody } from "@/lib/api";
import { chatSchema, chat } from "@/modules/ai";

export const POST = withAuth(async ({ req, user }) => chat(user, await parseBody(req, chatSchema)), { permission: ["ai:teacher", "ai:admin"] });
