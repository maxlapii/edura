import { withAuth, parseBody } from "@/lib/api";
import { assignSubstitute, assignSubstituteSchema } from "@/modules/substitution";

export const POST = withAuth(async ({ req, user, params }) => {
  const body = await parseBody(req, assignSubstituteSchema);
  return assignSubstitute(user, params.id, body.substituteTeacherId, body.note);
}, { permission: "substitution:manage" });
