import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { getRequest, MAINTENANCE_TRANSITIONS } from "@/modules/facilities";
import { Alert, Card, DescriptionList, PageHeader, StatusBadge } from "@/components/ui";
import { fmtDate, fmtDateTime, humanize } from "@/lib/format";
import { load, type IdParams } from "@/components/work/guard";
import { staffUsers } from "@/components/work/lookups";
import { cn } from "@/lib/utils";
import { AssignForm, StatusButtons } from "./maintenance-actions";

export const dynamic = "force-dynamic";

const STEPS = ["OPEN", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;

export default async function MaintenanceDetailPage({ params }: { params: IdParams }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const result = await load(() => getRequest(user, id));
  if (result.error || !result.data) {
    return (
      <div>
        <PageHeader title="Maintenance request" breadcrumb={<Link href="/maintenance">← Maintenance</Link>} />
        <Alert tone="error">{result.error}</Alert>
      </div>
    );
  }
  const r = result.data;
  const manager = hasPermission(user, "maintenance:manage");
  const canChangeStatus = manager || r.assignedToUserId === user.id;
  const targets = canChangeStatus ? [...MAINTENANCE_TRANSITIONS[r.status]] : [];
  const users = manager && r.status !== "CLOSED" ? await staffUsers(user.schoolId) : [];
  const stepIndex = STEPS.indexOf(r.status);
  const timeline: Array<{ label: string; at: Date | null; who?: string | null }> = [
    { label: "Reported", at: r.createdAt, who: r.reportedBy.name },
    { label: "Assigned", at: r.assignedTo ? r.updatedAt : null, who: r.assignedTo?.name ?? null },
    { label: "Resolved", at: r.resolvedAt },
    { label: "Closed", at: r.closedAt },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={r.title}
        breadcrumb={<Link href="/maintenance" className="hover:underline">← Maintenance</Link>}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge status={r.status} />
            <StatusBadge status={r.priority} />
            <span>{humanize(r.category)}</span>
            {r.overdue && <span className="font-medium text-red-700">Overdue</span>}
          </span>
        }
      />

      <ol className="flex flex-wrap items-center gap-2 text-xs" aria-label="Status progress" data-testid="status-timeline">
        {STEPS.map((s, i) => (
          <li key={s} className={cn("rounded-full border px-2.5 py-1", i < stepIndex && "border-emerald-200 bg-emerald-50 text-emerald-800", i === stepIndex && "border-brand-500 bg-brand-50 font-medium text-brand-800", i > stepIndex && "border-slate-200 text-slate-400")}>
            {humanize(s)}
          </li>
        ))}
      </ol>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Details">
            <DescriptionList
              items={[
                { label: "Room", value: r.room ? <Link href={`/rooms/${r.room.id}`} className="text-brand-700 hover:underline">{r.room.name} ({r.room.code})</Link> : "Not room specific" },
                { label: "Reported by", value: `${r.reportedBy.name} · ${fmtDateTime(r.createdAt)}` },
                { label: "Assigned to", value: r.assignedTo?.name ?? "Unassigned" },
                { label: "Due", value: r.dueDate ? fmtDate(r.dueDate) : "—" },
              ]}
            />
            {r.description && <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{r.description}</p>}
            {r.resolutionNote && (
              <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                <p className="text-xs font-medium uppercase tracking-wide">Resolution</p>
                <p className="mt-1 whitespace-pre-wrap">{r.resolutionNote}</p>
              </div>
            )}
          </Card>

          {canChangeStatus && (
            <Card title="Update status">
              <StatusButtons requestId={r.id} targets={targets} />
            </Card>
          )}
          {manager && r.status !== "CLOSED" && r.status !== "RESOLVED" && (
            <Card title={r.assignedTo ? "Reassign" : "Assign"} description="The assignee is notified and can update the status.">
              <AssignForm requestId={r.id} users={users} currentAssigneeId={r.assignedToUserId} />
            </Card>
          )}
        </div>

        <Card title="History" padded={false}>
          <ul className="divide-y divide-slate-100 text-sm">
            {timeline.map((t) => (
              <li key={t.label} className={cn("flex items-center justify-between px-4 py-2", !t.at && "text-slate-400")}>
                <span>
                  {t.label}
                  {t.who && t.at && <span className="ml-1 text-xs text-slate-500">· {t.who}</span>}
                </span>
                <span className="text-xs">{t.at ? fmtDateTime(t.at) : "—"}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
