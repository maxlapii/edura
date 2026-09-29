import { withAuth, parseBody } from "@/lib/api";
import { getSchool, updateSchool, updateSchoolSchema } from "@/modules/schools";

export const GET = withAuth(async ({ user, params }) => getSchool(user, params.id));

export const PATCH = withAuth(async ({ req, user, params }) => updateSchool(user, params.id, await parseBody(req, updateSchoolSchema)), { permission: "school:manage" });
