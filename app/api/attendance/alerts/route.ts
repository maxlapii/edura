import { withAuth } from "@/lib/api";
import { resolveSchoolId } from "@/lib/permissions";
import { repeatedAbsenceStudents } from "@/modules/attendance";

export const GET = withAuth(async ({ user }) => repeatedAbsenceStudents(resolveSchoolId(user)), { permission: "reports:school" });
