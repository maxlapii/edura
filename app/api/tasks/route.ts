import { withAuth, parseBody, parseQuery, created } from "@/lib/api";
import { createTask, createTaskSchema, listTasks, listTasksSchema } from "@/modules/tasks";

export const GET = withAuth(async ({ req, user }) => {
  const query = parseQuery(req, listTasksSchema);
  return listTasks(user, { status: query.status, assigneeUserId: query.assigneeUserId, overdue: query.overdue === "true", scope: query.scope });
}, { permission: "tasks:read" });

export const POST = withAuth(async ({ req, user }) => created(await createTask(user, await parseBody(req, createTaskSchema))), { permission: "tasks:manage" });
