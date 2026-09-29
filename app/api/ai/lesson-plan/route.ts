import { withAuth, parseBody } from "@/lib/api";
import { draftLessonPlanSchema, draftLessonPlan } from "@/modules/ai";

export const POST = withAuth(async ({ req, user }) => draftLessonPlan(user, await parseBody(req, draftLessonPlanSchema)), { permission: ["ai:teacher", "ai:admin"] });
