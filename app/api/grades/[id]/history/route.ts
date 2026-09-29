import { withAuth } from "@/lib/api";
import { gradeHistory } from "@/modules/grades";

export const GET = withAuth(async ({ user, params }) => gradeHistory(user, params.id), { permission: "grades:read" });
