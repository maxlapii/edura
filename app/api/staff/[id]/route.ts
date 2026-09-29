import { withAuth, parseBody } from "@/lib/api";
import { getStaff, updateStaff, updateStaffSchema } from "@/modules/staff";

export const GET = withAuth(async ({ user, params }) => getStaff(user, params.id));

export const PATCH = withAuth(async ({ req, user, params }) => updateStaff(user, params.id, await parseBody(req, updateStaffSchema)), { permission: "staff:manage" });
