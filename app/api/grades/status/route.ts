import { withAuth, parseBody } from "@/lib/api";
import { changeGradeStatus, gradeStatusActionSchema } from "@/modules/grades";

export const POST = withAuth(async ({ req, user }) => {
  const body = await parseBody(req, gradeStatusActionSchema);
  return changeGradeStatus(user, body.courseId, body.action, body.termId);
}, { permission: "grades:manage" });
