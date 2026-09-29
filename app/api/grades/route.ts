import { withAuth, parseBody } from "@/lib/api";
import { enterGrades, enterGradesSchema } from "@/modules/grades";

export const POST = withAuth(async ({ req, user }) => enterGrades(user, await parseBody(req, enterGradesSchema)), { permission: "grades:manage" });
