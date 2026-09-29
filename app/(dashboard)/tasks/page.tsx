import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { listTasks } from "@/modules/tasks";
import { Alert, Card, EmptyState, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR, Tabs } from "@/components/ui";
import { fmtDate, humanize } from "@/lib/format";
import { load, param, type SearchParams } from "@/components/work/guard";
import { cn } from "@/lib/utils";
import { TaskForm } from "./task-form";
import { TaskRowActions } from "./task-actions";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "open", label: "Open", status: "OPEN" },
  { key: "done", label: "Done", status: "DONE" },
  { key: "all", label: "All", status: undefined },
] as const;

function isOverdue(t: { dueDate: Date | null; status: string }, now: Date) {
  return !!t.dueDate && t.dueDate < now && (t.status === "TODO" || t.status === "IN_PROGRESS");
}

export default async function TasksPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireCurrentUser();
  const sp = await searchParams;
  const tabKey = param(sp.status) ?? "open";
  const tab = TABS.find((t) => t.key === tabKey) ?? TABS[0];
  const canAssign = hasPermission(user, "tasks:assign");
  const now = new Date();

  const [result, assignees] = await Promise.all([
    load(() => listTasks(user, { status: tab.status })),
    canAssign && user.schoolId
      ? prisma.user.findMany({
          where: { schoolId: user.schoolId, isActive: true, role: { in: ["SCHOOL_ADMIN", "PRINCIPAL", "DEPARTMENT_HEAD", "TEACHER", "STAFF"] }, ...(user.role === "DEPARTMENT_HEAD" ? { teacher: { departmentId: user.departmentId ?? "__none__" } } : {}) },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve(undefined),
  ]);
  const tasks = result.data ?? [];
  const overdueCount = tasks.filter((t) => isOverdue(t, now)).length;

  return (
    <div>
      <PageHeader title="Tasks" description={overdueCount ? `${overdueCount} overdue` : "Your personal to-do list and tasks assigned to you."} />

      {hasPermission(user, "tasks:manage") && (
        <Card className="mb-6">
          <TaskForm assignees={assignees} currentUserId={user.id} />
        </Card>
      )}

      <Tabs items={TABS.map((t) => ({ href: `/tasks?status=${t.key}`, label: t.label }))} current={`/tasks?status=${tab.key}`} />

      {result.error && <Alert tone="error">{result.error}</Alert>}
      {!result.error && tasks.length === 0 && <EmptyState title="No tasks here" description={tab.key === "open" ? "You're all caught up." : "Nothing to show."} />}
      {!result.error && tasks.length > 0 && (
        <Table>
          <THead>
            <tr>
              <TH>Task</TH>
              <TH>Due</TH>
              <TH>Priority</TH>
              <TH>Status</TH>
              <TH>Assignee</TH>
              <TH className="text-right">Actions</TH>
            </tr>
          </THead>
          <TBody>
            {tasks.map((t) => {
              const overdue = isOverdue(t, now);
              return (
                <TR key={t.id} data-testid="row" data-id={t.id} className={cn(overdue && "bg-red-50/60")}>
                  <TD>
                    <Link href={`/tasks/${t.id}`} className={cn("font-medium text-slate-900 hover:text-brand-700", t.status === "DONE" && "text-slate-500 line-through")}>
                      {t.title}
                    </Link>
                    {t.source !== "SELF" && <span className="ml-2 text-xs text-slate-400">via {humanize(t.source)}</span>}
                  </TD>
                  <TD className={cn("whitespace-nowrap", overdue && "font-medium text-red-700")}>
                    {fmtDate(t.dueDate)}
                    {overdue && <span className="ml-1 text-xs">(overdue)</span>}
                  </TD>
                  <TD>
                    <StatusBadge status={t.priority} />
                  </TD>
                  <TD>
                    <StatusBadge status={t.status} />
                  </TD>
                  <TD className="whitespace-nowrap">{t.assignee.id === user.id ? "Me" : t.assignee.name}</TD>
                  <TD className="text-right">
                    <TaskRowActions id={t.id} status={t.status} />
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </div>
  );
}
