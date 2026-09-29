import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { hasPermission, isAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getTask } from "@/modules/tasks";
import { Alert, Card, DescriptionList, PageHeader, StatusBadge } from "@/components/ui";
import { fmtDate, fmtDateTime, humanize } from "@/lib/format";
import { load, type IdParams } from "@/components/work/guard";
import { TaskEditor } from "./task-editor";

export const dynamic = "force-dynamic";

export default async function TaskDetailPage({ params }: { params: IdParams }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const result = await load(() => getTask(user, id));
  if (result.error || !result.data) {
    return (
      <div>
        <PageHeader title="Task" breadcrumb={<Link href="/tasks">← Tasks</Link>} />
        <Alert tone="error">{result.error}</Alert>
      </div>
    );
  }
  const task = result.data;
  const canAssign = hasPermission(user, "tasks:assign");
  const canEdit = task.assigneeUserId === user.id || task.createdByUserId === user.id || isAdmin(user);
  const canDelete = task.createdByUserId === user.id || isAdmin(user);
  const assignees =
    canAssign && user.schoolId
      ? await prisma.user.findMany({
          where: { schoolId: user.schoolId, isActive: true, role: { in: ["SCHOOL_ADMIN", "PRINCIPAL", "DEPARTMENT_HEAD", "TEACHER", "STAFF"] }, ...(user.role === "DEPARTMENT_HEAD" ? { teacher: { departmentId: user.departmentId ?? "__none__" } } : {}) },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : undefined;
  const assigneeOptions = assignees && !assignees.some((a) => a.id === task.assigneeUserId) ? [{ id: task.assignee.id, name: task.assignee.name }, ...assignees] : assignees;
  const overdue = !!task.dueDate && task.dueDate < new Date() && (task.status === "TODO" || task.status === "IN_PROGRESS");

  return (
    <div className="space-y-6">
      <PageHeader
        title={task.title}
        breadcrumb={<Link href="/tasks" className="hover:underline">← Tasks</Link>}
        description={
          <span className="inline-flex items-center gap-2">
            <StatusBadge status={task.status} /> <StatusBadge status={task.priority} />
            {overdue && <span className="text-red-700">Overdue</span>}
          </span>
        }
      />
      <Card title="Details">
        <DescriptionList
          items={[
            { label: "Assignee", value: task.assignee.name },
            { label: "Created by", value: task.createdBy?.name ?? "System" },
            { label: "Due", value: fmtDate(task.dueDate) },
            { label: "Source", value: humanize(task.source) },
            { label: "Created", value: fmtDateTime(task.createdAt) },
            { label: "Completed", value: task.completedAt ? fmtDateTime(task.completedAt) : "—" },
          ]}
        />
        {task.description && !canEdit && <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{task.description}</p>}
      </Card>
      {canEdit ? (
        <Card title="Edit task">
          <TaskEditor
            task={{ id: task.id, title: task.title, description: task.description, dueDate: task.dueDate, priority: task.priority, status: task.status, assigneeUserId: task.assigneeUserId }}
            assignees={assigneeOptions}
            canDelete={canDelete}
          />
        </Card>
      ) : (
        <Alert tone="info">You can view this task but only the assignee, creator or an administrator can edit it.</Alert>
      )}
    </div>
  );
}
