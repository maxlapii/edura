import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { getSession } from "@/modules/attendance";
import { computeAttendanceStats } from "@/modules/attendance/stats";
import { Card, EmptyState, LinkButton, PageHeader, StatCard, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { fmtDateTime, fmtLongDate } from "@/lib/format";
import { ServiceError } from "../../../_components/service-error";
import { load } from "../../../_lib/load";
import { qs, ymd } from "../../../_lib/helpers";

export const dynamic = "force-dynamic";

export default async function AttendanceSessionPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = await requireCurrentUser();
  const result = await load(() => getSession(user, id));
  if (!result.ok) return <ServiceError error={result.error} />;
  const session = result.data;
  const stats = computeAttendanceStats(session.records);
  const canEdit = !user.studentId && !user.guardianId;
  const editHref = `/attendance/take${qs({ courseId: session.courseId, date: ymd(session.date), slotId: session.timetableSlotId, periodId: session.timetableSlotId ? undefined : session.periodId })}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${session.course.subject.name} · ${session.course.class.name}`}
        breadcrumb={
          <Link href="/attendance" className="hover:underline">
            Attendance
          </Link>
        }
        description={
          <>
            {fmtLongDate(session.date)}
            {session.period ? ` · ${session.period.name}` : ""} · Teacher: {session.course.teacher.user.name}
            {session.submittedAt ? ` · Submitted ${fmtDateTime(session.submittedAt)}` : ""}
          </>
        }
        actions={
          <>
            <StatusBadge status={session.status} />
            {canEdit && (
              <LinkButton href={editHref} variant="outline" size="sm" data-testid="edit-attendance">
                Edit
              </LinkButton>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Present" value={stats.present} tone="good" />
        <StatCard label="Absent" value={stats.absent} tone={stats.absent ? "bad" : "default"} />
        <StatCard label="Late" value={stats.late} tone={stats.late ? "warn" : "default"} />
        <StatCard label="Excused" value={stats.excused} />
        <StatCard label="Attendance rate" value={`${stats.attendanceRate}%`} tone="info" />
      </div>

      <Card title="Records" padded={false}>
        {session.records.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No records yet" description="Attendance has not been recorded for this session." action={canEdit ? <LinkButton href={editHref}>Take attendance</LinkButton> : undefined} />
          </div>
        ) : (
          <Table className="rounded-t-none border-0">
            <THead>
              <tr>
                <TH>Student</TH>
                <TH>Status</TH>
                <TH>Note</TH>
              </tr>
            </THead>
            <TBody>
              {session.records.map((r) => (
                <TR key={r.id} data-testid="row" data-id={r.studentId}>
                  <TD>
                    {canEdit ? (
                      <Link href={`/students/${r.studentId}`} className="font-medium text-slate-900 hover:text-brand-700">
                        {r.student.lastName}, {r.student.firstName}
                      </Link>
                    ) : (
                      <span className="font-medium text-slate-900">
                        {r.student.lastName}, {r.student.firstName}
                      </span>
                    )}
                  </TD>
                  <TD>
                    <StatusBadge status={r.status} />
                    {r.minutesLate ? <span className="ml-2 text-xs text-slate-500">{r.minutesLate} min</span> : null}
                  </TD>
                  <TD className="text-slate-500">{r.note ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
