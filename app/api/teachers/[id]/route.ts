import { withAuth, parseBody } from "@/lib/api";
import { getTeacher, updateTeacher, updateTeacherSchema } from "@/modules/teachers";

export const GET = withAuth(async ({ user, params }) => getTeacher(user, params.id));

export const PATCH = withAuth(async ({ req, user, params }) => updateTeacher(user, params.id, await parseBody(req, updateTeacherSchema)));
