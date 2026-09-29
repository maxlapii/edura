import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { AuthUser } from "@/lib/auth/types";
import { assertPermission, assertSchoolAccess, hasPermission, isAdmin, resolveSchoolId } from "@/lib/permissions";
import { AppError } from "@/lib/utils/errors";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { dispatch } from "@/lib/workflows/engine";
import { differenceInCalendarDays } from "date-fns";
import type { TaskSource } from "@/generated/prisma/enums";
import type { CreateTaskInput, UpdateTaskInput } from "./schema";

const include = {
  assignee: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.TaskInclude;

export async function createTask(user: AuthUser, input: CreateTaskInput, source: TaskSource = "SELF", sourceId?: string) {
  assertPermission(user, "tasks:manage");
  const schoolId = resolveSchoolId(user);
  const assigneeUserId = input.assigneeUserId ?? user.id;
  if (assigneeUserId !== user.id) {
    assertPermission(user, "tasks:assign");
    const assignee = await prisma.user.findUnique({ where: { id: assigneeUserId } });
    if (!assignee || assignee.schoolId !== schoolId) throw AppError.validation("Assignee must belong to the same school");
    if (user.role === "DEPARTMENT_HEAD") {
      const t = await prisma.teacher.findUnique({ where: { userId: assigneeUserId } });
      if (!t || t.departmentId !== user.departmentId) throw AppError.forbidden("Department heads can only assign tasks within their department");
    }
  }
  const task = await prisma.task.create({
    data: { schoolId, title: input.title, description: input.description ?? null, assigneeUserId, createdByUserId: user.id, dueDate: input.dueDate ?? null, priority: input.priority, source: assigneeUserId === user.id ? source : source === "SELF" ? "ADMIN" : source, sourceId: sourceId ?? null },
    include,
  });
  await audit({ user, schoolId, action: "task.create", entityType: "Task", entityId: task.id, after: task });
  if (assigneeUserId !== user.id) {
    await notify({ schoolId, userId: assigneeUserId, type: "TASK_ASSIGNED", title: `New task: ${task.title}`, body: task.dueDate ? `Due ${task.dueDate.toISOString().slice(0, 10)}` : null, link: "/tasks" });
  }
  return task;
}

export async function listTasks(user: AuthUser, opts: { status?: string; assigneeUserId?: string; overdue?: boolean; scope?: "mine" | "all" } = {}) {
  assertPermission(user, "tasks:read");
  const schoolId = resolveSchoolId(user);
  const where: Prisma.TaskWhereInput = { schoolId };
  if (opts.scope === "all" && hasPermission(user, "tasks:assign")) {
    if (opts.assigneeUserId) where.assigneeUserId = opts.assigneeUserId;
    if (user.role === "DEPARTMENT_HEAD") where.assignee = { teacher: { departmentId: user.departmentId ?? "__none__" } };
  } else {
    where.OR = [{ assigneeUserId: user.id }, { createdByUserId: user.id }];
  }
  if (opts.status === "OPEN") where.status = { in: ["TODO", "IN_PROGRESS"] };
  else if (opts.status) where.status = opts.status as Prisma.TaskWhereInput["status"];
  if (opts.overdue) {
    where.dueDate = { lt: new Date() };
    where.status = { in: ["TODO", "IN_PROGRESS"] };
  }
  return prisma.task.findMany({ where, include, orderBy: [{ status: "asc" }, { dueDate: "asc" }, { priority: "desc" }], take: 300 });
}

export async function getTask(user: AuthUser, id: string) {
  const task = await prisma.task.findUnique({ where: { id }, include });
  if (!task) throw AppError.notFound("Task");
  assertSchoolAccess(user, task.schoolId);
  if (task.assigneeUserId !== user.id && task.createdByUserId !== user.id && !hasPermission(user, "tasks:assign")) throw AppError.forbidden();
  return task;
}

export async function updateTask(user: AuthUser, id: string, input: UpdateTaskInput) {
  const before = await getTask(user, id);
  const canManage = before.assigneeUserId === user.id || before.createdByUserId === user.id || isAdmin(user);
  if (!canManage) throw AppError.forbidden();
  if (input.assigneeUserId && input.assigneeUserId !== before.assigneeUserId) {
    assertPermission(user, "tasks:assign");
    const assignee = await prisma.user.findUnique({ where: { id: input.assigneeUserId } });
    if (!assignee || assignee.schoolId !== before.schoolId) throw AppError.validation("Assignee must belong to the same school");
  }
  const task = await prisma.task.update({ where: { id }, data: { ...input, completedAt: input.status === "DONE" ? (before.completedAt ?? new Date()) : input.status ? null : undefined }, include });
  await audit({ user, schoolId: before.schoolId, action: "task.update", entityType: "Task", entityId: id, before, after: task });
  if (input.assigneeUserId && input.assigneeUserId !== before.assigneeUserId) {
    await notify({ schoolId: before.schoolId, userId: input.assigneeUserId, type: "TASK_ASSIGNED", title: `Task assigned: ${task.title}`, link: "/tasks" });
  }
  return task;
}

export async function deleteTask(user: AuthUser, id: string) {
  const before = await getTask(user, id);
  if (before.createdByUserId !== user.id && !isAdmin(user)) throw AppError.forbidden("Only the creator or an administrator can delete a task");
  await prisma.task.delete({ where: { id } });
  await audit({ user, schoolId: before.schoolId, action: "task.delete", entityType: "Task", entityId: id, before });
}

/** Scheduled job: emit TASK_OVERDUE (once per task per day). */
export async function processOverdueTasks(schoolId: string, now = new Date()) {
  const tasks = await prisma.task.findMany({ where: { schoolId, status: { in: ["TODO", "IN_PROGRESS"] }, dueDate: { lt: now } }, include: { assignee: { select: { id: true, name: true } } } });
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  let emitted = 0;
  for (const t of tasks) {
    const already = await prisma.workflowRun.findFirst({ where: { schoolId, trigger: "TASK_OVERDUE", createdAt: { gte: dayStart }, payload: { path: ["taskId"], equals: t.id } } });
    if (already) continue;
    await dispatch("TASK_OVERDUE", schoolId, {
      sourceId: t.id,
      taskId: t.id,
      taskTitle: t.title,
      dueDate: t.dueDate,
      daysOverdue: differenceInCalendarDays(now, t.dueDate!),
      assigneeUserId: t.assigneeUserId,
      assigneeName: t.assignee.name,
    });
    emitted++;
  }
  return { tasks: tasks.length, emitted };
}
