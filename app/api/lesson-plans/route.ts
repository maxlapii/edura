import { z } from "zod";
import { withAuth, parseBody, parseQuery, created } from "@/lib/api";
import { dateOnlySchema } from "@/lib/validation";
import { createLessonPlan, createLessonPlanSchema, listLessonPlans } from "@/modules/lessonPlans";

const listQuerySchema = z.object({
  courseId: z.string().optional(),
  teacherId: z.string().optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  status: z.enum(["DRAFT", "READY", "COMPLETED"]).optional(),
});

export const GET = withAuth(async ({ req, user }) => listLessonPlans(user, parseQuery(req, listQuerySchema)), { permission: "lesson_plans:read" });

export const POST = withAuth(async ({ req, user }) => created(await createLessonPlan(user, await parseBody(req, createLessonPlanSchema))), { permission: "lesson_plans:manage" });
