import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { listLeaveRequests } from "@/modules/leave";
import { Alert, PageHeader, StatusBadge, Table, Tabs, TBody, TD, TH, THead, TR } from "@/components/ui";
import { fmtDate, humanize } from "@/lib/format";
import { inclusiveDays } from "@/lib/utils/dates";
import { guarded, str } from "../_lib/guard";
import type { PageProps } from "../_lib/types";

export const dynamic = "force-dynamic";

const STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;

export default async function LeaveAdminPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const user = await requireCurrentUser();
  const statusParam = str(sp, "status");
  const status = statusParam === "all" ? undefined : (STATUSES as readonly string[]).includes(statusParam ?? "") ? statusParam : "PENDING";
  const res = await guarded(() => listLeaveRequests(user, { scope: "all", status }));
  if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
  const items = res.data;
  const current = `/admin/leave?status=${status ?? "all"}`;
  return (
    <div className="space-y-4">
      <PageHeader title="Leave requests" description="Review teacher leave and arrange cover." />
      <Tabs items={[...STATUSES.map((s) => ({ href: `/admin/leave?status=${s}`, label: humanize(s) })), { href: "/admin/leave?status=all", label: "All" }]} current={current} />
      <Table>
        <THead>
          <TR>
            <TH>Teacher</TH>
            <TH>Type</TH>
            <TH>From</TH>
            <TH>To</TH>
            <TH>Days</TH>
            <TH>Reason</TH>
            <TH>Cover</TH>
            <TH>Status</TH>
          </TR>
        </THead>
        <TBody>
          {items.map((l) => (
            <TR key={l.id} data-testid="row" data-id={l.id}>
              <TD>
                <Link href={`/admin/leave/${l.id}`} className="font-medium text-brand-700 hover:underline">
                  {l.teacher?.user.name ?? l.requester.name}
                </Link>
                <div className="text-xs text-slate-500">{l.teacher?.department?.name ?? humanize(l.requester.role)}</div>
              </TD>
              <TD>{humanize(l.type)}</TD>
              <TD>{fmtDate(l.startDate)}</TD>
              <TD>{fmtDate(l.endDate)}</TD>
              <TD>{inclusiveDays(l.startDate, l.endDate)}</TD>
              <TD className="max-w-xs truncate">{l.reason ?? "—"}</TD>
              <TD>
                {l.substitutions.length ? `${l.substitutions.filter((s) => s.status === "ASSIGNED" || s.status === "COMPLETED").length} / ${l.substitutions.length}` : "—"}
              </TD>
              <TD>
                <StatusBadge status={l.status} />
              </TD>
            </TR>
          ))}
          {items.length === 0 && (
            <TR>
              <TD colSpan={8} className="text-center text-slate-500">
                No leave requests.
              </TD>
            </TR>
          )}
        </TBody>
      </Table>
    </div>
  );
}
