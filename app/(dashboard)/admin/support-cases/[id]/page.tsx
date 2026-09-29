import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { getSupportCase } from "@/modules/supportCases";
import { Alert, Badge, Card, DescriptionList, PageHeader, StatusBadge } from "@/components/ui";
import { fmtDate, fmtDateTime, humanize } from "@/lib/format";
import { ActionButton } from "../../_components/action-button";
import { EntityForm } from "../../_components/entity-form";
import { guarded } from "../../_lib/guard";
import { enumOptions, staffUserOptions } from "../../_lib/options";
import type { PageProps } from "../../_lib/types";
import { CASE_CATEGORIES, CASE_STATUSES } from "../_fields";

export const dynamic = "force-dynamic";

export default async function SupportCaseDetailPage({ params }: PageProps<{ id: string }>) {
  const { id } = await params;
  const user = await requireCurrentUser();
  const res = await guarded(() => getSupportCase(user, id));
  if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
  const c = res.data;
  const users = await staffUserOptions(user);
  const transitions = CASE_STATUSES.filter((s) => s !== c.status);
  return (
    <div className="space-y-6">
      <PageHeader
        title={c.title}
        description={`${humanize(c.category)} · opened ${fmtDateTime(c.createdAt)} by ${c.createdBy.name}`}
        breadcrumb={
          <Link href="/admin/support-cases" className="hover:underline">
            Student support
          </Link>
        }
        actions={
          <>
            {c.isSensitive && <Badge tone="purple">Sensitive</Badge>}
            <StatusBadge status={c.status} />
          </>
        }
      />
      {c.redacted && <Alert tone="warning">This case is marked sensitive. Details are only visible to the creator, the assignee and users with sensitive-data permission.</Alert>}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Details">
            <DescriptionList
              items={[
                { label: "Student", value: <Link href={`/admin/students/${c.student.id}`} className="text-brand-700 hover:underline">{c.student.firstName} {c.student.lastName} ({c.student.studentNumber})</Link> },
                { label: "Class", value: c.student.class?.name ?? "—" },
                { label: "Assigned to", value: c.assignedTo?.name ?? "Unassigned" },
                { label: "Follow-up", value: fmtDate(c.followUpDate) },
                { label: "Resolved", value: c.resolvedAt ? fmtDateTime(c.resolvedAt) : "—" },
              ]}
            />
            {!c.redacted && (
              <div className="mt-4">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Description</div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{c.description || "—"}</p>
              </div>
            )}
          </Card>
          <Card title={`Notes & actions (${c.notes.length})`}>
            {c.redacted ? (
              <p className="text-sm text-slate-500">Notes are hidden.</p>
            ) : (
              <ul className="space-y-3">
                {c.notes.map((n) => (
                  <li key={n.id} className="rounded-md border border-slate-200 p-3 text-sm" data-testid="note" data-id={n.id}>
                    <div className="mb-1 text-xs text-slate-500">
                      {n.author.name} · {fmtDateTime(n.createdAt)}
                    </div>
                    <p className="whitespace-pre-wrap">{n.body}</p>
                  </li>
                ))}
                {c.notes.length === 0 && <li className="text-sm text-slate-500">No notes yet.</li>}
              </ul>
            )}
            <div className="mt-4 border-t border-slate-100 pt-4">
              <EntityForm
                testId="support-case-note-form"
                action={`/api/support-cases/${c.id}/notes`}
                submitLabel="Add note"
                resetOnSuccess
                columns={1}
                compact
                fields={[
                  { name: "body", label: "Note", type: "textarea", rows: 3, required: true },
                  { name: "followUpDate", label: "Next follow-up", type: "date" },
                ]}
              />
            </div>
          </Card>
          {!c.redacted && (
            <details className="rounded-card bg-white shadow-card p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-900">Edit case</summary>
              <div className="mt-3">
                <EntityForm
                  testId="support-case-edit-form"
                  method="PATCH"
                  action={`/api/support-cases/${c.id}`}
                  initial={c as unknown as Record<string, unknown>}
                  fields={[
                    { name: "title", label: "Title", required: true },
                    { name: "category", label: "Category", type: "select", options: enumOptions(CASE_CATEGORIES), required: true },
                    { name: "description", label: "Description", type: "textarea", rows: 4, className: "sm:col-span-2", nullable: true },
                    { name: "isSensitive", label: "Sensitive", type: "checkbox" },
                    { name: "followUpDate", label: "Follow-up date", type: "date", nullable: true },
                  ]}
                />
              </div>
            </details>
          )}
        </div>
        <div className="space-y-6">
          <Card title="Status">
            <div className="flex flex-wrap gap-2">
              {transitions.map((s) => (
                <ActionButton key={s} action={`/api/support-cases/${c.id}/status`} body={{ status: s }} label={humanize(s)} variant={s === "RESOLVED" ? "primary" : "outline"} testId={`status-${s}`} />
              ))}
            </div>
          </Card>
          <Card title="Assign">
            <EntityForm testId="support-case-assign-form" action={`/api/support-cases/${c.id}/assign`} submitLabel="Assign" columns={1} compact initial={{ assignedToUserId: c.assignedToUserId ?? "" }} fields={[{ name: "assignedToUserId", label: "Assignee", type: "select", options: users, required: true, placeholder: "Select a staff member…" }]} />
          </Card>
        </div>
      </div>
    </div>
  );
}
