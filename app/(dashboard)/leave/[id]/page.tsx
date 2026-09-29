import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { getLeaveRequest } from "@/modules/leave";
import { Alert, Card, DescriptionList, PageHeader, StatCard, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { DAY_SHORT, fmtDate, fmtDateTime } from "@/lib/format";
import { ActionButton } from "../../_components/action-button";
import { ServiceError } from "../../_components/service-error";
import { load } from "../../_lib/load";

export const dynamic = "force-dynamic";

export default async function LeaveRequestPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = await requireCurrentUser();
  const result = await load(() => getLeaveRequest(user, id));
  if (!result.ok) return <ServiceError error={result.error} />;
  const leave = result.data;
  const impact = leave.impact;
  const canCancel = leave.status === "PENDING" || leave.status === "APPROVED";
  const isOwner = leave.requesterUserId === user.id;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${leave.type.charAt(0) + leave.type.slice(1).toLowerCase()} leave · ${fmtDate(leave.startDate)} → ${fmtDate(leave.endDate)}`}
        breadcrumb={
          <Link href="/leave" className="hover:underline">
            Leave
          </Link>
        }
        description={`Requested by ${leave.requester.name} on ${fmtDateTime(leave.createdAt)}`}
        actions={
          <>
            <StatusBadge status={leave.status} />
            {canCancel && <ActionButton method="DELETE" path={`/api/leave/${leave.id}`} label="Cancel request" busyLabel="Cancelling…" variant="danger" confirmText={leave.status === "APPROVED" ? "Cancel this approved leave? Any substitutions arranged for it will be cancelled too." : "Cancel this leave request?"} testId="cancel-leave" />}
          </>
        }
      />

      {leave.status === "PENDING" && <Alert tone="info">Waiting for review. You will be notified when a decision is made.</Alert>}
      {leave.status === "REJECTED" && <Alert tone="error" title="Not approved">{leave.reviewComment ?? "No comment was given."}</Alert>}
      {leave.status === "APPROVED" && <Alert tone="success" title="Approved">{leave.reviewComment ?? "Substitute teachers are being arranged for your affected lessons."}</Alert>}

      <Card title="Request">
        <DescriptionList
          items={[
            { label: "Reason", value: leave.reason ?? "—" },
            { label: "Teacher", value: leave.teacher ? `${leave.teacher.user.name}${leave.teacher.department ? ` · ${leave.teacher.department.name}` : ""}` : leave.requester.name },
            { label: "Reviewed by", value: leave.reviewedBy ? `${leave.reviewedBy.name} · ${fmtDateTime(leave.reviewedAt)}` : "—" },
            { label: "Reviewer comment", value: leave.reviewComment ?? "—" },
          ]}
        />
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Days" value={impact.days} hint={`${impact.workingDays} working days`} />
        <StatCard label="Lessons affected" value={impact.lessons} tone={impact.lessons ? "warn" : "good"} />
        <StatCard label="Classes affected" value={impact.classesAffected} />
        <StatCard label="Students affected" value={impact.studentsAffected} />
      </div>

      <Card title="Affected lessons" description={isOwner ? "Who is covering each lesson while you are away." : "Substitution status per lesson."} padded={false}>
        {impact.affected.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No timetabled lessons fall within this leave.</p>
        ) : (
          <Table className="rounded-t-none border-0">
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Period</TH>
                <TH>Lesson</TH>
                <TH>Room</TH>
                <TH>Substitute</TH>
                <TH>Status</TH>
              </tr>
            </THead>
            <TBody>
              {impact.affected.map((l) => (
                <TR key={`${l.slot.id}-${l.date.toISOString()}`} data-testid="lesson-row" data-id={l.slot.id}>
                  <TD className="whitespace-nowrap">
                    {DAY_SHORT[l.slot.dayOfWeek]} {fmtDate(l.date)}
                  </TD>
                  <TD>{l.slot.period.name}</TD>
                  <TD>
                    {l.slot.course.subject.name} · {l.slot.course.class.name}
                    <span className="ml-1 text-xs text-slate-500">({l.slot.course.class._count.students} students)</span>
                  </TD>
                  <TD>{l.slot.room?.name ?? "—"}</TD>
                  <TD>{l.substitution?.substituteTeacher?.user.name ?? <span className="text-slate-400">Not yet assigned</span>}</TD>
                  <TD>{l.substitution ? <StatusBadge status={l.substitution.status} /> : <span className="text-xs text-slate-400">{leave.status === "APPROVED" ? "Pending" : "Awaiting approval"}</span>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
