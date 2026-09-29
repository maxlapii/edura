import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getStudent } from "@/modules/students";
import { studentAttendanceSummary } from "@/modules/attendance";
import { studentGrades } from "@/modules/grades";
import { Alert, Badge, Card, DescriptionList, PageHeader, StatCard, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { fmtDate, fmtDateTime, humanize } from "@/lib/format";
import { optional, ServiceError } from "../../_components/service-error";
import { load } from "../../_lib/load";
import { studentName } from "../../_lib/helpers";

export const dynamic = "force-dynamic";

export default async function StudentProfilePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = await requireCurrentUser();
  const studentResult = await load(() => getStudent(user, id));
  if (!studentResult.ok) return <ServiceError error={studentResult.error} />;
  const student = studentResult.data;
  const [attendance, grades, submissions] = await Promise.all([
    optional(() => studentAttendanceSummary(user, id)),
    optional(() => studentGrades(user, id)),
    prisma.submission.findMany({ where: { studentId: id }, orderBy: { submittedAt: "desc" }, take: 10, include: { assignment: { select: { id: true, title: true, course: { select: { subject: { select: { name: true } } } } } } } }),
  ]);
  const isStaff = !user.studentId && !user.guardianId;
  const primary = student.guardians.find((g) => g.isPrimary) ?? student.guardians[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title={studentName(student)}
        breadcrumb={
          isStaff ? (
            <Link href="/students" className="hover:underline">
              Students
            </Link>
          ) : undefined
        }
        description={`${student.studentNumber} · ${student.class ? `${student.class.name}${student.class.homeroomTeacher ? ` · Homeroom: ${student.class.homeroomTeacher.user.name}` : ""}` : "No class assigned"}`}
        actions={<StatusBadge status={student.status} />}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Attendance rate" value={attendance ? `${attendance.stats.attendanceRate}%` : "—"} tone={attendance && attendance.flagged ? "bad" : "good"} hint={attendance ? `${attendance.stats.absent} absences · ${attendance.stats.late} late` : undefined} />
        <StatCard label="Recent absences" value={attendance?.recentAbsences ?? "—"} tone={attendance?.flagged ? "bad" : "default"} hint={attendance ? `threshold ${attendance.threshold}` : undefined} />
        <StatCard label="Overall average" value={grades?.overall === null || grades?.overall === undefined ? "—" : `${grades.overall}%`} tone="info" />
        <StatCard label="Open support cases" value={student.supportCases.filter((c) => c.status !== "RESOLVED").length} />
      </div>

      {attendance?.flagged && <Alert tone="warning">Repeated absences: {attendance.recentAbsences} in the recent window (threshold {attendance.threshold}).</Alert>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Profile">
          <DescriptionList
            items={[
              { label: "Date of birth", value: fmtDate(student.dateOfBirth) },
              { label: "Gender", value: student.gender ?? "—" },
              { label: "Enrolled", value: fmtDate(student.enrollmentDate) },
              { label: "Academic year", value: student.class?.academicYear.name ?? "—" },
              { label: "Login", value: student.user ? student.user.email : "No account" },
              { label: "Notes", value: student.notes ?? "—" },
              ...(student.medicalNotes ? [{ label: "Medical notes", value: student.medicalNotes }] : []),
            ]}
          />
        </Card>
        <Card title="Guardians">
          {student.guardians.length === 0 ? (
            <p className="text-sm text-slate-500">No guardians linked.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {student.guardians.map((g) => (
                <li key={g.guardianId} className="py-2">
                  <div className="font-medium text-slate-900">
                    {g.guardian.user.name}
                    {g.relationship && <span className="ml-1 text-xs text-slate-500">· {g.relationship}</span>}
                    {g.isPrimary && <Badge tone="blue" className="ml-2">Primary</Badge>}
                  </div>
                  <div className="text-xs text-slate-500">
                    {g.guardian.user.email}
                    {(g.guardian.phone ?? g.guardian.user.phone) ? ` · ${g.guardian.phone ?? g.guardian.user.phone}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {primary && isStaff && (
            <div className="mt-3">
              <Link href={`/messages/new?studentId=${student.id}`} className="text-sm text-brand-700 hover:underline">
                Message the family
              </Link>
            </div>
          )}
        </Card>
      </div>

      {attendance && (
        <Card title="Recent attendance" padded={false}>
          {attendance.records.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No attendance records yet.</p>
          ) : (
            <Table className="rounded-t-none border-0">
              <THead>
                <tr>
                  <TH>Date</TH>
                  <TH>Lesson</TH>
                  <TH>Status</TH>
                  <TH>Note</TH>
                </tr>
              </THead>
              <TBody>
                {attendance.records.slice(0, 15).map((r) => (
                  <TR key={r.id} data-testid="attendance-row" data-id={r.id}>
                    <TD className="whitespace-nowrap">{fmtDate(r.date)}</TD>
                    <TD>
                      {r.session.course.subject.name}
                      {r.session.period ? ` · ${r.session.period.name}` : ""}
                    </TD>
                    <TD>
                      <StatusBadge status={r.status} />
                    </TD>
                    <TD className="text-slate-500">{r.note ?? "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      )}

      {grades && (
        <Card title="Grades" padded={false}>
          {grades.courses.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No grades yet.</p>
          ) : (
            <Table className="rounded-t-none border-0">
              <THead>
                <tr>
                  <TH>Course</TH>
                  <TH>Item</TH>
                  <TH>Score</TH>
                  <TH>Letter</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <TBody>
                {grades.courses.flatMap((c) =>
                  c.grades.map((g) => (
                    <TR key={g.id} data-testid="grade-row" data-id={g.id}>
                      <TD>{c.subject}</TD>
                      <TD>{g.assignment?.title ?? g.assessment?.title ?? "Grade"}</TD>
                      <TD className="font-medium">
                        {g.score} / {g.maxScore}
                      </TD>
                      <TD>{g.letter ?? "—"}</TD>
                      <TD>
                        <StatusBadge status={g.status} />
                      </TD>
                    </TR>
                  )),
                )}
              </TBody>
            </Table>
          )}
        </Card>
      )}

      <Card title="Recent submissions" padded={false}>
        {submissions.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No submissions yet.</p>
        ) : (
          <Table className="rounded-t-none border-0">
            <THead>
              <tr>
                <TH>Assignment</TH>
                <TH>Course</TH>
                <TH>Submitted</TH>
                <TH>Status</TH>
              </tr>
            </THead>
            <TBody>
              {submissions.map((s) => (
                <TR key={s.id} data-testid="submission-row" data-id={s.id}>
                  <TD>
                    <Link href={`/assignments/${s.assignment.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {s.assignment.title}
                    </Link>
                  </TD>
                  <TD className="text-slate-500">{s.assignment.course.subject.name}</TD>
                  <TD>{fmtDateTime(s.submittedAt)}</TD>
                  <TD>
                    <StatusBadge status={s.status} />
                    {s.isLate && <Badge tone="amber" className="ml-1">Late</Badge>}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {student.supportCases.length > 0 && (
        <Card title="Support cases" padded={false}>
          <Table className="rounded-t-none border-0">
            <THead>
              <tr>
                <TH>Title</TH>
                <TH>Category</TH>
                <TH>Status</TH>
                <TH>Follow-up</TH>
              </tr>
            </THead>
            <TBody>
              {student.supportCases.map((c) => (
                <TR key={c.id} data-testid="support-row" data-id={c.id}>
                  <TD>
                    <div className="font-medium text-slate-900">{c.title}</div>
                    {c.description && <div className="text-xs text-slate-500">{c.description}</div>}
                    {c.isSensitive && <Badge tone="purple" className="mt-1">Sensitive</Badge>}
                  </TD>
                  <TD>{humanize(c.category)}</TD>
                  <TD>
                    <StatusBadge status={c.status} />
                  </TD>
                  <TD>{fmtDate(c.followUpDate)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      {student.disciplineIncidents.length > 0 && (
        <Card title="Discipline" padded={false}>
          <Table className="rounded-t-none border-0">
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Category</TH>
                <TH>Severity</TH>
                <TH>Description</TH>
                <TH>Parent notified</TH>
              </tr>
            </THead>
            <TBody>
              {student.disciplineIncidents.map((d) => (
                <TR key={d.id} data-testid="discipline-row" data-id={d.id}>
                  <TD className="whitespace-nowrap">{fmtDate(d.date)}</TD>
                  <TD>{d.category}</TD>
                  <TD>
                    <StatusBadge status={d.severity} />
                  </TD>
                  <TD>
                    {d.description}
                    {d.actions && <div className="text-xs text-slate-500">Actions: {d.actions}</div>}
                  </TD>
                  <TD>{d.parentNotified ? "Yes" : "No"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
