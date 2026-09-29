import { withAuth, parseBody, noContent } from "@/lib/api";
import { deleteTask, getTask, updateTask, updateTaskSchema } from "@/modules/tasks";

export const GET = withAuth(async ({ user, params }) => getTask(user, params.id), { permission: "tasks:read" });

export const PATCH = withAuth(async ({ req, user, params }) => updateTask(user, params.id, await parseBody(req, updateTaskSchema)), { permission: "tasks:manage" });

export const DELETE = withAuth(async ({ user, params }) => {
  await deleteTask(user, params.id);
  return noContent();
}, { permission: "tasks:manage" });
