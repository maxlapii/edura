import { z } from "zod";
import { withAuth, parseBody } from "@/lib/api";
import { enterGrades, gradeInputSchema } from "@/modules/grades";

const bodySchema = z.object({
  grades: z.array(gradeInputSchema).min(1),
  termId: z.string().optional().nullable(),
});

export const POST = withAuth(async ({ req, user, params }) => {
  const body = await parseBody(req, bodySchema);
  return enterGrades(user, { assignmentId: params.id, grades: body.grades, termId: body.termId });
}, { permission: "grades:manage" });
