import { withAuth, parseBody, noContent } from "@/lib/api";
import { deleteCourse, getCourse, updateCourse, updateCourseSchema } from "@/modules/classes";

export const GET = withAuth(async ({ user, params }) => getCourse(user, params.id));

export const PATCH = withAuth(async ({ req, user, params }) => updateCourse(user, params.id, await parseBody(req, updateCourseSchema)), { permission: "classes:manage" });

export const DELETE = withAuth(async ({ user, params }) => {
  await deleteCourse(user, params.id);
  return noContent();
}, { permission: "classes:manage" });
