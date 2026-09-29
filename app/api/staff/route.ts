import { withAuth, parseBody, parseQuery, created } from "@/lib/api";
import { createStaff, createStaffSchema, listStaff, listStaffSchema } from "@/modules/staff";

export const GET = withAuth(async ({ req, user }) => listStaff(user, parseQuery(req, listStaffSchema)), { permission: "staff:read" });

export const POST = withAuth(async ({ req, user }) => created(await createStaff(user, await parseBody(req, createStaffSchema))), { permission: "staff:manage" });
