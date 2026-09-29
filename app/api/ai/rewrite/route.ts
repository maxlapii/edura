import { withAuth, parseBody } from "@/lib/api";
import { rewriteTextSchema, rewriteText } from "@/modules/ai";

export const POST = withAuth(async ({ req, user }) => rewriteText(user, await parseBody(req, rewriteTextSchema)), { permission: ["ai:teacher", "ai:admin"] });
