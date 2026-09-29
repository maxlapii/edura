import { withAuth, parseBody, parseQuery, created } from "@/lib/api";
import { createTeacher, createTeacherSchema, listTeachers, listTeachersSchema } from "@/modules/teachers";

export const GET = withAuth(async ({ req, user }) => listTeachers(user, parseQuery(req, listTeachersSchema)), { permission: "teachers:read" });

export const POST = withAuth(async ({ req, user }) => created(await createTeacher(user, await parseBody(req, createTeacherSchema))), { permission: "teachers:manage" });
