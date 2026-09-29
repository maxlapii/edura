import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { classAttendanceSummary, repeatedAbsenceStudents } from "@/modules/attendance";
import { Alert, Badge, Card, LinkButton, PageHeader, StatCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { FilterBar, FilterField, FilterInput, FilterSelect } from "../_components/filter-bar";
import { guarded, qs, str } from "../_lib/guard";
import { classOptions } from "../_lib/options";
import type { PageProps } from "../_lib/types";

export const dynamic = "force-dynamic";

export default async function AttendanceAdminPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const user = await requireCurrentUser();
  const classId = str(sp, "classId");
  const from = str(sp, "from");
  const to = str(sp, "to");
  const range = { from: from ? new Date(`${from}T00:00:00.000Z`) : undefined, to: to ? new Date(`${to}T00:00:00.000Z`) : undefined };
  const classes = await classOptions(user);
  const res = await guarded(async () => {
    const [alerts, summary] = await Promise.all([user.schoolId ? repeatedAbsenceStudents(user.schoolId) : Promise.resolve([]), classId ? classAttendanceSummary(user, classId, range) : Promise.resolve(null)]);
    return { alerts, summary };
  });
  if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
  const { alerts, summary } = res.data;
  const csv = classId ? `/api/reports/class-attendance${qs({ classId, from, to, format: "csv" })}` : null;
  return (
    <div className="space-y-6">
      <PageHeader title="Attendance" description="Repeated absences and per-class attendance statistics." actions={csv && <LinkButton href={csv} variant="outline" size="sm" data-testid="csv-link">Download CSV</LinkButton>} />
      <Card title="Attendance alerts" description="Students at or above the school's repeated-absence threshold.">
        {alerts.length === 0 ? (
          <p className="text-sm text-slate-500">No students with repeated absences.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Student</TH>
                <TH>Class</TH>
                <TH>Absences</TH>
              </TR>
            </THead>
            <TBody>
              {alerts.map((a) => (
                <TR key={a.student.id} data-testid="alert-row" data-id={a.student.id}>
                  <TD>
                    <Link href={`/admin/students/${a.student.id}`} className="font-medium text-brand-700 hover:underline">
                      {a.student.firstName} {a.student.lastName}
                    </Link>
                  </TD>
                  <TD>{a.student.class ? <Link href={`/admin/attendance?classId=${a.student.class.id}`} className="hover:underline">{a.student.class.name}</Link> : "—"}</TD>
                  <TD>
                    <Badge tone="red">{a.absences}</Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      <FilterBar action="/admin/attendance">
        <FilterField label="Class">
          <FilterSelect name="classId" defaultValue={classId ?? ""} options={classes} empty="Select a class…" />
        </FilterField>
        <FilterField label="From">
          <FilterInput name="from" type="date" defaultValue={from} />
        </FilterField>
        <FilterField label="To">
          <FilterInput name="to" type="date" defaultValue={to} />
        </FilterField>
      </FilterBar>
      {summary && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatCard label="Attendance rate" value={`${summary.overall.attendanceRate}%`} tone={summary.overall.attendanceRate < 90 ? "warn" : "good"} hint={`${summary.overall.total} records`} />
            <StatCard label="Present" value={summary.overall.present} />
            <StatCard label="Absent" value={summary.overall.absent} tone={summary.overall.absent ? "bad" : "default"} />
            <StatCard label="Late" value={summary.overall.late} />
            <StatCard label="Excused" value={summary.overall.excused} />
          </div>
          <Card title={`${summary.className} · per student`} description={`Flagged at ${summary.threshold} absences within ${summary.windowDays} days.`} padded={false}>
            <Table className="rounded-none border-0">
              <THead>
                <TR>
                  <TH>Student</TH>
                  <TH>Rate</TH>
                  <TH>Present</TH>
                  <TH>Absent</TH>
                  <TH>Late</TH>
                  <TH>Excused</TH>
                  <TH>Recent absences</TH>
                </TR>
              </THead>
              <TBody>
                {summary.rows.map((r) => (
                  <TR key={r.student.id} data-testid="row" data-id={r.student.id} className={r.flagged ? "bg-red-50/60" : undefined}>
                    <TD>
                      <Link href={`/admin/students/${r.student.id}`} className="font-medium text-brand-700 hover:underline">
                        {r.student.lastName}, {r.student.firstName}
                      </Link>
                    </TD>
                    <TD>{r.stats.total ? `${r.stats.attendanceRate}%` : "—"}</TD>
                    <TD>{r.stats.present}</TD>
                    <TD>{r.stats.absent}</TD>
                    <TD>{r.stats.late}</TD>
                    <TD>{r.stats.excused}</TD>
                    <TD>{r.flagged ? <Badge tone="red">{r.recentAbsences}</Badge> : r.recentAbsences}</TD>
                  </TR>
                ))}
                {summary.rows.length === 0 && (
                  <TR>
                    <TD colSpan={7} className="text-center text-slate-500">
                      No students in this class.
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </Card>
        </div>
      )}
    </div>
  );
}
