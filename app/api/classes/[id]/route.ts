import { withAuth, parseBody, noContent } from "@/lib/api";
import { deleteClass, getClass, updateClass, updateClassSchema } from "@/modules/classes";

export const GET = withAuth(async ({ user, params }) => getClass(user, params.id), { permission: "classes:read" });

export const PATCH = withAuth(async ({ req, user, params }) => updateClass(user, params.id, await parseBody(req, updateClassSchema)), { permission: "classes:manage" });

export const DELETE = withAuth(async ({ user, params }) => {
  await deleteClass(user, params.id);
  return noContent();
}, { permission: "classes:manage" });
