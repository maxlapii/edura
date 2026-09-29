import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { listSessions, pendingAttendanceForTeacher } from "@/modules/attendance";
import { Alert, Card, EmptyState, LinkButton, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { DateNav } from "../_components/date-nav";
import { ServiceError } from "../_components/service-error";
import { load } from "../_lib/load";
import { dateParam, ymd, type SearchParams } from "../_lib/helpers";

export const dynamic = "force-dynamic";

export default async function AttendancePage(props: { searchParams: Promise<SearchParams> }) {
  const sp = await props.searchParams;
  const user = await requireCurrentUser();
  const date = dateParam(sp);
  const teacherId = user.teacherId;
  const result = await load(async () => {
    const [pending, sessions] = await Promise.all([teacherId ? pendingAttendanceForTeacher(teacherId, date) : Promise.resolve([]), listSessions(user, {})]);
    return { pending, sessions: sessions.slice(0, 20) };
  });
  if (!result.ok) return <ServiceError error={result.error} />;
  const { pending, sessions } = result.data;

  return (
    <div className="space-y-6">
      <PageHeader title="Attendance" description="Lessons that still need attendance, and your recent sessions." actions={<DateNav date={date} basePath="/attendance" />} />

      {!teacherId ? (
        <Alert tone="info">Your account has no teaching profile, so there are no lessons to take attendance for. You can still review sessions below.</Alert>
      ) : (
        <Card title={`To complete on ${ymd(date)}`} description="Includes lessons you are covering as a substitute.">
          {pending.length === 0 ? (
            <EmptyState title="All attendance is complete" description="Every lesson on this day has a submitted attendance session." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {pending.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-2" data-testid="row" data-id={s.id}>
                  <div className="flex items-center gap-3">
                    <div className="w-24 text-xs text-slate-500">
                      <div className="font-medium text-slate-700">{s.period.name}</div>
                      {s.period.startTime}–{s.period.endTime}
                    </div>
                    <Link href={`/classes/${s.course.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {s.course.subject.name} · {s.course.class.name}
                    </Link>
                  </div>
                  <LinkButton href={`/attendance/take?courseId=${s.course.id}&slotId=${s.id}&date=${ymd(date)}`} size="sm" data-testid="take-attendance">
                    Take attendance
                  </LinkButton>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card title="Recent sessions" padded={false}>
        {sessions.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No attendance sessions yet" />
          </div>
        ) : (
          <Table className="rounded-t-none border-0">
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Course</TH>
                <TH>Period</TH>
                <TH>Status</TH>
                <TH>Records</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {sessions.map((s) => (
                <TR key={s.id} data-testid="session-row" data-id={s.id}>
                  <TD className="whitespace-nowrap">{fmtDate(s.date)}</TD>
                  <TD>
                    <Link href={`/classes/${s.course.id}`} className="hover:text-brand-700">
                      {s.course.subject.name} · {s.course.class.name}
                    </Link>
                  </TD>
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
