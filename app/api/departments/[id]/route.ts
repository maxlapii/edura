import { withAuth, parseBody, noContent } from "@/lib/api";
import { deleteDepartment, getDepartment, updateDepartment, updateDepartmentSchema } from "@/modules/departments";

export const GET = withAuth(async ({ user, params }) => getDepartment(user, params.id), { permission: "departments:read" });

export const PATCH = withAuth(async ({ req, user, params }) => updateDepartment(user, params.id, await parseBody(req, updateDepartmentSchema)), { permission: "departments:manage" });

export const DELETE = withAuth(async ({ user, params }) => {
  await deleteDepartment(user, params.id);
  return noContent();
}, { permission: "departments:manage" });
