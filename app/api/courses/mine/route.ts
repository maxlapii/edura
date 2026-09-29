import { withAuth } from "@/lib/api";
import { listMyCourses } from "@/modules/classes";

export const GET = withAuth(async ({ user }) => listMyCourses(user));
