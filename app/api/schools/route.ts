import { withAuth, parseBody, created } from "@/lib/api";
import { createSchool, createSchoolSchema, listSchools } from "@/modules/schools";

export const GET = withAuth(async ({ user }) => listSchools(user));

export const POST = withAuth(async ({ req, user }) => created(await createSchool(user, await parseBody(req, createSchoolSchema))), { permission: "school:manage" });
