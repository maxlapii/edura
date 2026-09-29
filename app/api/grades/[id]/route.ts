import { withAuth, parseBody } from "@/lib/api";
import { updateGrade, updateGradeSchema } from "@/modules/grades";

export const PATCH = withAuth(async ({ req, user, params }) => updateGrade(user, params.id, await parseBody(req, updateGradeSchema)), { permission: "grades:manage" });
