import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { getCourse } from "@/modules/classes";
import { classAttendanceSummary, listSessions } from "@/modules/attendance";
import { Alert, Badge, Card, EmptyState, LinkButton, StatCard, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { isAppError } from "@/lib/utils/errors";
import { ServiceError } from "../../../_components/service-error";
import { load } from "../../../_lib/load";
import { studentName, ymd } from "../../../_lib/helpers";
import { todayDateOnly } from "@/lib/utils/dates";
import { CourseHub } from "../../_components/course-hub";

export const dynamic = "force-dynamic";

export default async function CourseAttendancePage(props: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await props.params;
  const user = await requireCurrentUser();
  const courseResult = await load(() => getCourse(user, courseId));
  if (!courseResult.ok) return <ServiceError error={courseResult.error} />;
  const course = courseResult.data;

  const [summary, sessions] = await Promise.all([load(() => classAttendanceSummary(user, course.classId)), load(() => listSessions(user, { courseId }))]);
  const summaryError = !summary.ok ? summary.error : null;
  if (summaryError && !(isAppError(summaryError) && summaryError.code === "FORBIDDEN")) return <ServiceError error={summaryError} />;
  if (!sessions.ok) return <ServiceError error={sessions.error} />;
  const canRecord = !user.studentId && !user.guardianId;
  const today = ymd(todayDateOnly());

  return (
    <div>
      <CourseHub
        course={course}
        tab="attendance"
        actions={
          canRecord ? (
            <LinkButton href={`/attendance/take?courseId=${course.id}&date=${today}`} size="sm" data-testid="take-attendance">
              Take attendance
            </LinkButton>
          ) : undefined
        }
      />

      {summary.ok ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Attendance rate" value={`${summary.data.overall.attendanceRate}%`} tone={summary.data.overall.attendanceRate < 90 ? "warn" : "good"} />
            <StatCard label="Records" value={summary.data.overall.total} />
            <StatCard label="Absences" value={summary.data.overall.absent} tone={summary.data.overall.absent ? "bad" : "default"} />
            <StatCard label="Flagged students" value={summary.data.rows.filter((r) => r.flagged).length} hint={`≥ ${summary.data.threshold} absences in ${summary.data.windowDays} days`} tone={summary.data.rows.some((r) => r.flagged) ? "warn" : "good"} />
          </div>
          <Card title="Per student" padded={false}>
            <Table className="rounded-t-none border-0">
              <THead>
                <tr>
                  <TH>Student</TH>
                  <TH>Present</TH>
                  <TH>Late</TH>
                  <TH>Absent</TH>
                  <TH>Excused</TH>
                  <TH>Rate</TH>
                  <TH>Recent absences</TH>
                </tr>
              </THead>
              <TBody>
                {summary.data.rows.map((r) => (
                  <TR key={r.student.id} data-testid="row" data-id={r.student.id}>
                    <TD>
                      <Link href={`/students/${r.student.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                        {studentName(r.student)}
                      </Link>
                    </TD>
                    <TD>{r.stats.present}</TD>
                    <TD>{r.stats.late}</TD>
                    <TD>{r.stats.absent}</TD>
                    <TD>{r.stats.excused}</TD>
                    <TD>{r.stats.attendanceRate}%</TD>
                    <TD>
                      {r.recentAbsences}
                      {r.flagged && (
                        <Badge tone="red" className="ml-2">
                          Repeated absence
                        </Badge>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </div>
      ) : (
        <Alert tone="info">Attendance statistics are only visible to the teachers of this class.</Alert>
      )}

      <Card title="Sessions" description="Most recent attendance sessions for this course" className="mt-6" padded={false}>
        {sessions.data.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No attendance sessions yet" />
          </div>
        ) : (
          <Table className="rounded-t-none border-0">
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Period</TH>
                <TH>Status</TH>
                <TH>Records</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {sessions.data.slice(0, 30).map((s) => (
                <TR key={s.id} data-testid="session-row" data-id={s.id}>
                  <TD>{fmtDate(s.date)}</TD>
                  <TD>{s.period?.name ?? "—"}</TD>
                  <TD>
                    <StatusBadge status={s.status} />
                  </TD>
                  <TD>{s._count.records}</TD>
                  <TD className="text-right">
                    <Link href={`/attendance/sessions/${s.id}`} className="text-sm text-brand-700 hover:underline">
                      View
                    </Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
