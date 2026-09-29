import { withAuth } from "@/lib/api";
import { teacherDirectory } from "@/modules/teachers";

export const GET = withAuth(async ({ user }) => teacherDirectory(user), { permission: "teachers:read" });
