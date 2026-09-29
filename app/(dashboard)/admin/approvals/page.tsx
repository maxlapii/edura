import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { listApprovals } from "@/modules/approvals";
import { Alert, PageHeader, StatusBadge, Table, Tabs, TBody, TD, TH, THead, TR } from "@/components/ui";
import { fmtDateTime, humanize } from "@/lib/format";
import { ActionButton } from "../_components/action-button";
import { guarded, str } from "../_lib/guard";
import type { PageProps } from "../_lib/types";

export const dynamic = "force-dynamic";

const STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
type Status = (typeof STATUSES)[number];

function entityHref(entityType: string, entityId: string): string | null {
  switch (entityType) {
    case "LeaveRequest":
      return `/admin/leave/${entityId}`;
    case "Event":
      return `/events/${entityId}`;
    default:
      return null;
  }
}

export default async function ApprovalsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const user = await requireCurrentUser();
  const statusParam = str(sp, "status");
  const status: Status | undefined = statusParam === "all" ? undefined : (STATUSES as readonly string[]).includes(statusParam ?? "") ? (statusParam as Status) : "PENDING";
  const res = await guarded(() => listApprovals(user, { scope: "all", status }));
  if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
  const items = res.data;
  return (
    <div className="space-y-4">
      <PageHeader title="Approvals" description="Leave, events, trips and resource requests awaiting a decision." />
      <Tabs items={[...STATUSES.map((s) => ({ href: `/admin/approvals?status=${s}`, label: humanize(s) })), { href: "/admin/approvals?status=all", label: "All" }]} current={`/admin/approvals?status=${status ?? "all"}`} />
      <Table>
        <THead>
          <TR>
            <TH>Request</TH>
            <TH>Type</TH>
            <TH>Requester</TH>
            <TH>Created</TH>
            <TH>Decision</TH>
            <TH>Status</TH>
            <TH className="text-right">Actions</TH>
          </TR>
        </THead>
        <TBody>
          {items.map((a) => {
            const href = entityHref(a.entityType, a.entityId);
            return (
              <TR key={a.id} data-testid="row" data-id={a.id}>
                <TD>
                  {href ? (
                    <Link href={href} className="font-medium text-brand-700 hover:underline">
                      {a.title}
                    </Link>
                  ) : (
                    <span className="font-medium">{a.title}</span>
                  )}
                  {a.comment && <div className="text-xs text-slate-500">{a.comment}</div>}
                </TD>
                <TD>{humanize(a.type)}</TD>
                <TD>{a.requester.name}</TD>
                <TD>{fmtDateTime(a.createdAt)}</TD>
                <TD>
                  {a.approver ? a.approver.name : "—"}
                  {a.decisionAt && <div className="text-xs text-slate-500">{fmtDateTime(a.decisionAt)}</div>}
                </TD>
                <TD>
                  <StatusBadge status={a.status} />
                </TD>
                <TD className="text-right">
                  {a.status === "PENDING" && (
                    <span className="inline-flex gap-1">
                      <ActionButton action={`/api/approvals/${a.id}/decide`} body={{ action: "APPROVE" }} promptField={{ key: "comment", label: "Comment (optional)" }} label="Approve" variant="primary" testId="approve" />
                      <ActionButton action={`/api/approvals/${a.id}/decide`} body={{ action: "REJECT" }} promptField={{ key: "comment", label: "Reason for rejection (optional)" }} label="Reject" variant="danger" testId="reject" />
                    </span>
                  )}
                </TD>
              </TR>
            );
          })}
          {items.length === 0 && (
            <TR>
              <TD colSpan={7} className="text-center text-slate-500">
                Nothing to approve.
              </TD>
            </TR>
          )}
        </TBody>
      </Table>
    </div>
  );
}
