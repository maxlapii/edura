import { withAuth, parseBody } from "@/lib/api";
import { updateAcademicYear, updateAcademicYearSchema } from "@/modules/academic";

export const PATCH = withAuth(async ({ req, user, params }) => updateAcademicYear(user, params.id, await parseBody(req, updateAcademicYearSchema)), { permission: "academic:manage" });
