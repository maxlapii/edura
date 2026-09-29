import { withAuth, parseBody, noContent } from "@/lib/api";
import { deleteSubject, updateSubject, updateSubjectSchema } from "@/modules/subjects";

export const PATCH = withAuth(async ({ req, user, params }) => updateSubject(user, params.id, await parseBody(req, updateSubjectSchema)), { permission: "subjects:manage" });

export const DELETE = withAuth(async ({ user, params }) => {
  await deleteSubject(user, params.id);
  return noContent();
}, { permission: "subjects:manage" });
