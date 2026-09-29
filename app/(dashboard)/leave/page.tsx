import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { listLeaveRequests } from "@/modules/leave";
import { Card, EmptyState, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { inclusiveDays, todayDateOnly } from "@/lib/utils/dates";
import { ServiceError } from "../_components/service-error";
import { load } from "../_lib/load";
import { ymd } from "../_lib/helpers";
import { LeaveForm } from "./leave-form";

export const dynamic = "force-dynamic";

export default async function LeavePage() {
  const user = await requireCurrentUser();
  const result = await load(() => listLeaveRequests(user, { scope: "mine" }));
  if (!result.ok) return <ServiceError error={result.error} />;
  const requests = result.data;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <PageHeader title="Leave" description="Your leave requests and their review status." />
        <Card title="My requests" padded={false}>
          {requests.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No leave requests yet" description="Use the form to request leave. Your administrator reviews it and arranges cover for affected lessons." />
            </div>
          ) : (
            <Table className="rounded-t-none border-0">
              <THead>
                <tr>
                  <TH>Dates</TH>
                  <TH>Type</TH>
                  <TH>Days</TH>
                  <TH>Status</TH>
                  <TH>Requested</TH>
                </tr>
              </THead>
              <TBody>
                {requests.map((l) => (
                  <TR key={l.id} data-testid="row" data-id={l.id}>
                    <TD>
                      <Link href={`/leave/${l.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                        {fmtDate(l.startDate)} → {fmtDate(l.endDate)}
                      </Link>
                    </TD>
                    <TD>{l.type.charAt(0) + l.type.slice(1).toLowerCase()}</TD>
                    <TD>{inclusiveDays(l.startDate, l.endDate)}</TD>
                    <TD>
                      <StatusBadge status={l.status} />
                    </TD>
                    <TD className="text-slate-500">{fmtDateTime(l.createdAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
      <div>
        <Card title="Request leave" description="Overlapping requests are rejected automatically.">
          <LeaveForm today={ymd(todayDateOnly())} />
        </Card>
      </div>
    </div>
  );
}
