import { withAuth, parseBody, created } from "@/lib/api";
import { createAssessment, createAssessmentSchema, listAssessments } from "@/modules/grades";

const createBodySchema = createAssessmentSchema.omit({ courseId: true });

export const GET = withAuth(async ({ user, params }) => listAssessments(user, params.id), { permission: "grades:read" });

export const POST = withAuth(
  async ({ req, user, params }) => created(await createAssessment(user, { ...(await parseBody(req, createBodySchema)), courseId: params.id })),
  { permission: "grades:manage" },
);
