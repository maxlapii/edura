import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { listMyCourses } from "@/modules/classes";
import { pendingGrading, studentGrades } from "@/modules/grades";
import { myChildren } from "@/modules/guardians";
import { Card, EmptyState, LinkButton, PageHeader, StatCard, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { ChildSelector } from "../_components/child-selector";
import { ServiceError } from "../_components/service-error";
import { load } from "../_lib/load";
import { param, type SearchParams } from "../_lib/helpers";

export const dynamic = "force-dynamic";

type StudentGradesData = Awaited<ReturnType<typeof studentGrades>>;

export default async function GradesPage(props: { searchParams: Promise<SearchParams> }) {
  const sp = await props.searchParams;
  const user = await requireCurrentUser();

  // ── Parent: child selector → that child's grades ──
  if (user.guardianId) {
    const result = await load(async () => {
      const children = await myChildren(user);
      const current = children.find((c) => c.id === param(sp, "studentId")) ?? children[0] ?? null;
      const grades = current ? await studentGrades(user, current.id) : null;
      return { children, current, grades };
    });
    if (!result.ok) return <ServiceError error={result.error} />;
    const { children, current, grades } = result.data;
    return (
      <div>
        <PageHeader title="Grades" description="Published grades for your children." />
        <ChildSelector items={children} current={current?.id ?? null} basePath="/grades" />
        {grades && <StudentGradesView data={grades} />}
      </div>
    );
  }

  // ── Student: own grades ──
  if (user.studentId) {
    const result = await load(() => studentGrades(user, user.studentId!));
    if (!result.ok) return <ServiceError error={result.error} />;
    return (
      <div>
        <PageHeader title="My grades" description="Grades published by your teachers, grouped by course." />
        <StudentGradesView data={result.data} />
      </div>
    );
  }

  // ── Teacher / admin: pending grading + gradebooks ──
  const result = await load(async () => {
    const [pending, courses] = await Promise.all([pendingGrading(user), listMyCourses(user)]);
    return { pending, courses };
  });
  if (!result.ok) return <ServiceError error={result.error} />;
  const { pending, courses } = result.data;
  const totalPending = pending.reduce((s, r) => s + r.pending, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Grades" description="Submissions waiting for a grade and the gradebook of every course." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Submissions to grade" value={totalPending} tone={totalPending ? "warn" : "good"} />
        <StatCard label="Assignments with pending grading" value={pending.length} />
        <StatCard label="Courses" value={courses.length} />
      </div>
      <Card title="Pending grading" padded={false}>
        {pending.length === 0 ? (
          <div className="p-4">
            <EmptyState title="Nothing to grade" description="Every submission has been graded." />
          </div>
        ) : (
          <Table className="rounded-t-none border-0">
            <THead>
              <tr>
                <TH>Assignment</TH>
                <TH>Course</TH>
                <TH>Due</TH>
                <TH>Pending</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {pending.map((r) => (
                <TR key={r.assignment.id} data-testid="row" data-id={r.assignment.id}>
                  <TD>
                    <Link href={`/assignments/${r.assignment.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {r.assignment.title}
                    </Link>
                  </TD>
                  <TD className="text-slate-500">
                    {r.assignment.course.subject.name} · {r.assignment.course.class.name}
                  </TD>
                  <TD>{fmtDate(r.assignment.dueDate)}</TD>
                  <TD className="font-medium text-amber-700">{r.pending}</TD>
                  <TD className="text-right">
                    <LinkButton href={`/assignments/${r.assignment.id}`} size="sm" variant="outline">
                      Grade
                    </LinkButton>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      <Card title="Gradebooks">
        {courses.length === 0 ? (
          <p className="text-sm text-slate-500">No courses.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((c) => (
              <li key={c.id}>
                <Link href={`/classes/${c.id}/gradebook`} className="block rounded-md border border-slate-200 px-3 py-2 text-sm hover:border-brand-300 hover:bg-brand-50">
                  <span className="font-medium text-slate-900">{c.subject.name}</span> <span className="text-slate-500">· {c.class.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function StudentGradesView({ data }: { data: StudentGradesData }) {
  if (data.courses.length === 0) return <EmptyState title="No grades published yet" description="Grades appear here once teachers submit them." />;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Overall average" value={data.overall === null ? "—" : `${data.overall}%`} tone="info" />
        <StatCard label="Courses" value={data.courses.length} />
        <StatCard label="Grades" value={data.courses.reduce((s, c) => s + c.grades.length, 0)} />
      </div>
      {data.courses.map((c) => (
        <Card key={c.courseId} title={c.subject} description={`${c.teacher} · average ${c.summary.average === null ? "—" : `${c.summary.average}% (${c.summary.letter})`}`} padded={false}>
          <Table className="rounded-t-none border-0">
            <THead>
              <tr>
                <TH>Item</TH>
                <TH>Score</TH>
                <TH>Letter</TH>
                <TH>Comment</TH>
                <TH>Status</TH>
              </tr>
            </THead>
            <TBody>
              {c.grades.map((g) => (
                <TR key={g.id} data-testid="row" data-id={g.id}>
                  <TD>{g.assignment ? <Link href={`/assignments/${g.assignment.id}`} className="hover:text-brand-700">{g.assignment.title}</Link> : g.assessment ? `${g.assessment.title} (${g.assessment.type.toLowerCase()})` : "Grade"}</TD>
                  <TD className="font-medium">
                    {g.score} / {g.maxScore}
                  </TD>
                  <TD>{g.letter ?? "—"}</TD>
                  <TD className="text-slate-500">{g.comment ?? "—"}</TD>
                  <TD>
                    <StatusBadge status={g.status} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      ))}
    </div>
  );
}
