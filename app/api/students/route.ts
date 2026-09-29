import { withAuth, parseBody, parseQuery, created } from "@/lib/api";
import { createStudent, createStudentSchema, listStudents, listStudentsSchema } from "@/modules/students";

export const GET = withAuth(async ({ req, user }) => listStudents(user, parseQuery(req, listStudentsSchema)), { permission: "students:read" });

export const POST = withAuth(async ({ req, user }) => created(await createStudent(user, await parseBody(req, createStudentSchema))), { permission: "students:manage" });
