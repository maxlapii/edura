import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { getMaintenanceDashboard, listRequests } from "@/modules/facilities";
import { Alert, Card, EmptyState, PageHeader, StatCard, StatusBadge, Table, TBody, TD, TH, THead, TR, Tabs } from "@/components/ui";
import { fmtDate, fmtDateTime, humanize } from "@/lib/format";
import { load, optional, param, type SearchParams } from "@/components/work/guard";
import { roomOptions } from "@/components/work/lookups";
import { cn } from "@/lib/utils";
import { MaintenanceForm } from "./maintenance-form";

export const dynamic = "force-dynamic";

const STATUSES = ["OPEN", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
type Status = (typeof STATUSES)[number];

export default async function MaintenancePage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireCurrentUser();
  const sp = await searchParams;
  const statusParam = param(sp.status);
  const status = (STATUSES as readonly string[]).includes(statusParam ?? "") ? (statusParam as Status) : undefined;
  const manager = hasPermission(user, "maintenance:manage");

  const [result, dashboard, rooms] = await Promise.all([load(() => listRequests(user, { status })), manager ? optional(() => getMaintenanceDashboard(user)) : Promise.resolve(null), roomOptions(user.schoolId)]);
  const items = result.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Maintenance" description={manager ? "Track, assign and resolve facility issues." : "Report facility issues and follow the ones you reported."} />

      {dashboard && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <StatCard label="Open" value={dashboard.open} tone={dashboard.open ? "warn" : "good"} href="/maintenance?status=OPEN" />
          <StatCard label="High priority" value={dashboard.highPriority} tone={dashboard.highPriority ? "bad" : "default"} />
          <StatCard label="Assigned" value={dashboard.assigned} href="/maintenance?status=ASSIGNED" />
          <StatCard label="In progress" value={dashboard.inProgress} href="/maintenance?status=IN_PROGRESS" />
          <StatCard label="Overdue" value={dashboard.overdueCount} tone={dashboard.overdueCount ? "bad" : "good"} />
        </div>
      )}

      <Card>
        <MaintenanceForm rooms={rooms} defaultRoomId={param(sp.roomId)} />
      </Card>

      <div>
        <Tabs items={[{ href: "/maintenance", label: "All" }, ...STATUSES.map((s) => ({ href: `/maintenance?status=${s}`, label: humanize(s) }))]} current={status ? `/maintenance?status=${status}` : "/maintenance"} />
        {result.error && <Alert tone="error">{result.error}</Alert>}
        {!result.error && items.length === 0 && <EmptyState title="No maintenance requests" description="Reported issues will appear here." />}
        {!result.error && items.length > 0 && (
          <Table>
            <THead>
              <tr>
                <TH>Request</TH>
                <TH>Category</TH>
                <TH>Room</TH>
                <TH>Priority</TH>
                <TH>Status</TH>
                <TH>Assigned to</TH>
                <TH>Reported</TH>
              </tr>
            </THead>
            <TBody>
              {items.map((r) => (
                <TR key={r.id} data-testid="row" data-id={r.id} className={cn(r.overdue && "bg-red-50/60")}>
                  <TD>
                    <Link href={`/maintenance/${r.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {r.title}
                    </Link>
                    {r.overdue && <span className="ml-2 text-xs font-medium text-red-700">Overdue{r.dueDate ? ` (due ${fmtDate(r.dueDate)})` : ""}</span>}
                  </TD>
                  <TD>{humanize(r.category)}</TD>
                  <TD>{r.room?.name ?? "—"}</TD>
                  <TD>
                    <StatusBadge status={r.priority} />
                  </TD>
                  <TD>
                    <StatusBadge status={r.status} />
                  </TD>
                  <TD>{r.assignedTo?.name ?? "—"}</TD>
                  <TD className="whitespace-nowrap text-xs text-slate-500">
                    {r.reportedBy.name}
                    <div>{fmtDateTime(r.createdAt)}</div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>

      {dashboard && dashboard.recentlyResolved.length > 0 && (
        <Card title="Recently resolved" padded={false}>
          <ul className="divide-y divide-slate-100 text-sm">
            {dashboard.recentlyResolved.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-2">
                <Link href={`/maintenance/${r.id}`} className="hover:text-brand-700">
                  {r.title} <span className="text-xs text-slate-500">· {r.room?.name ?? humanize(r.category)}</span>
                </Link>
                <span className="text-xs text-slate-500">{r.resolvedAt ? fmtDateTime(r.resolvedAt) : "—"}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
