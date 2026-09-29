import { withAuth, parseBody } from "@/lib/api";
import { getStudent, updateStudent, updateStudentSchema } from "@/modules/students";

export const GET = withAuth(async ({ user, params }) => getStudent(user, params.id));

export const PATCH = withAuth(async ({ req, user, params }) => updateStudent(user, params.id, await parseBody(req, updateStudentSchema)), { permission: "students:manage" });
