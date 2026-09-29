import { z } from "zod";
import { withAuth, parseBody, parseQuery, created } from "@/lib/api";
import { createCourse, createCourseSchema, listCourses } from "@/modules/classes";

const listQuerySchema = z.object({
  classId: z.string().optional(),
  teacherId: z.string().optional(),
  subjectId: z.string().optional(),
  academicYearId: z.string().optional(),
});

export const GET = withAuth(async ({ req, user }) => listCourses(user, parseQuery(req, listQuerySchema)), { permission: "classes:read" });

export const POST = withAuth(async ({ req, user }) => created(await createCourse(user, await parseBody(req, createCourseSchema))), { permission: "classes:manage" });
