import { withAuth, parseBody, noContent } from "@/lib/api";
import { deleteAssignment, getAssignment, updateAssignment, updateAssignmentSchema } from "@/modules/assignments";

export const GET = withAuth(async ({ user, params }) => getAssignment(user, params.id), { permission: "assignments:read" });

export const PATCH = withAuth(async ({ req, user, params }) => updateAssignment(user, params.id, await parseBody(req, updateAssignmentSchema)), { permission: "assignments:manage" });

export const DELETE = withAuth(async ({ user, params }) => {
  await deleteAssignment(user, params.id);
  return noContent();
}, { permission: "assignments:manage" });
