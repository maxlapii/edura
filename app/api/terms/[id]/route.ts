import { withAuth, parseBody } from "@/lib/api";
import { updateTerm, updateTermSchema } from "@/modules/academic";

export const PATCH = withAuth(async ({ req, user, params }) => updateTerm(user, params.id, await parseBody(req, updateTermSchema)), { permission: "academic:manage" });
