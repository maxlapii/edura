import { withAuth, parseBody, noContent } from "@/lib/api";
import { deleteLessonPlan, getLessonPlan, updateLessonPlan, updateLessonPlanSchema } from "@/modules/lessonPlans";

export const GET = withAuth(async ({ user, params }) => getLessonPlan(user, params.id), { permission: "lesson_plans:read" });

export const PATCH = withAuth(async ({ req, user, params }) => updateLessonPlan(user, params.id, await parseBody(req, updateLessonPlanSchema)), { permission: "lesson_plans:manage" });

export const DELETE = withAuth(async ({ user, params }) => {
  await deleteLessonPlan(user, params.id);
  return noContent();
}, { permission: "lesson_plans:manage" });
