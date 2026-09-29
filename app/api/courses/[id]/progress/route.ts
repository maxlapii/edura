import { withAuth } from "@/lib/api";
import { curriculumProgress } from "@/modules/lessonPlans";

export const GET = withAuth(async ({ user, params }) => curriculumProgress(user, params.id), { permission: "lesson_plans:read" });
