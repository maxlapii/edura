import { requireCurrentUser } from "@/lib/auth/session";
import { listTasks } from "@/modules/tasks";
import { Alert, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { fmtDate, humanize } from "@/lib/format";
import { ActionButton } from "../_components/action-button";
import { EntityForm } from "../_components/entity-form";
import { FilterBar, FilterField, FilterSelect } from "../_components/filter-bar";
import { guarded, str } from "../_lib/guard";
import { enumOptions, staffUserOptions } from "../_lib/options";
import type { PageProps } from "../_lib/types";
import { CreatePanel } from "@/app/(dashboard)/_components/create-panel";

export const dynamic = "force-dynamic";

export default async function TasksAdminPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const user = await requireCurrentUser();
  const status = str(sp, "status");
  const assigneeUserId = str(sp, "assigneeUserId");
  const overdue = str(sp, "overdue") === "true";
  const res = await guarded(() => listTasks(user, { scope: "all", status, assigneeUserId, overdue }));
  if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
  const tasks = res.data;
  const users = await staffUserOptions(user);
  const now = new Date().getTime();
  return (
    <div className="space-y-4">
      <PageHeader title="All tasks" description={`${tasks.length} tasks across the school`} />
      <FilterBar action="/admin/tasks">
        <FilterField label="Status">
          <FilterSelect name="status" defaultValue={status ?? ""} options={[{ value: "OPEN", label: "Open (to do + in progress)" }, ...enumOptions(["TODO", "IN_PROGRESS", "DONE", "CANCELLED"])]} />
        </FilterField>
        <FilterField label="Assignee">
          <FilterSelect name="assigneeUserId" defaultValue={assigneeUserId ?? ""} options={users} />
        </FilterField>
        <FilterField label="Overdue">
          <FilterSelect name="overdue" defaultValue={overdue ? "true" : ""} options={[{ value: "true", label: "Only overdue" }]} empty="Any" />
        </FilterField>
      </FilterBar>
      <div className="flex flex-col gap-4">
        <div className="min-w-0">
          <Table>
            <THead>
              <TR>
                <TH>Task</TH>
                <TH>Assignee</TH>
                <TH>Due</TH>
                <TH>Priority</TH>
                <TH>Source</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {tasks.map((t) => {
                const late = t.dueDate && t.dueDate.getTime() < now && (t.status === "TODO" || t.status === "IN_PROGRESS");
                return (
                  <TR key={t.id} data-testid="row" data-id={t.id}>
                    <TD>
                      <div className="font-medium">{t.title}</div>
                      {t.description && <div className="max-w-md truncate text-xs text-slate-500">{t.description}</div>}
                    </TD>
                    <TD>{t.assignee.name}</TD>
                    <TD className={late ? "font-medium text-red-700" : undefined}>{fmtDate(t.dueDate)}</TD>
                    <TD>
                      <StatusBadge status={t.priority} />
                    </TD>
                    <TD className="text-xs text-slate-500">{humanize(t.source)}</TD>
                    <TD>
                      <StatusBadge status={t.status} />
                    </TD>
                    <TD className="text-right">
                      <span className="inline-flex gap-1">
                        {(t.status === "TODO" || t.status === "IN_PROGRESS") && <ActionButton action={`/api/tasks/${t.id}`} method="PATCH" body={{ status: "DONE" }} label="Done" testId="complete-task" />}
                        <ActionButton action={`/api/tasks/${t.id}`} method="DELETE" label="Delete" variant="danger" confirm={`Delete task "${t.title}"?`} testId="delete-task" />
                      </span>
                    </TD>
                  </TR>
                );
              })}
              {tasks.length === 0 && (
                <TR>
                  <TD colSpan={7} className="text-center text-slate-500">
                    No tasks match the filter.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </div>
        <CreatePanel className="order-first" title="Assign task">
          <EntityForm
            testId="task-form"
            action="/api/tasks"
            submitLabel="Assign task"
            resetOnSuccess
            columns={3}
            compact
            initial={{ priority: "MEDIUM" }}
            fields={[
              { name: "title", label: "Title", required: true },
              { name: "description", label: "Description", type: "textarea", rows: 3 },
              { name: "assigneeUserId", label: "Assignee", type: "select", options: users, required: true, placeholder: "Select a user…" },
              { name: "dueDate", label: "Due date", type: "date" },
              { name: "priority", label: "Priority", type: "select", options: enumOptions(["LOW", "MEDIUM", "HIGH", "URGENT"]), required: true },
            ]}
          />
        </CreatePanel>
      </div>
    </div>
  );
}
