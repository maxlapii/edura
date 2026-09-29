import { withAuth, parseBody, created } from "@/lib/api";
import { copyLessonPlan, copyLessonPlanSchema } from "@/modules/lessonPlans";

export const POST = withAuth(async ({ req, user, params }) => created(await copyLessonPlan(user, params.id, await parseBody(req, copyLessonPlanSchema))), { permission: "lesson_plans:manage" });
