import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/permissions";
import { getCourse } from "@/modules/classes";
import { courseGradebook } from "@/modules/grades";
import { Badge, Card, EmptyState, StatCard } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { ServiceError } from "../../../_components/service-error";
import { load } from "../../../_lib/load";
import { studentName } from "../../../_lib/helpers";
import { CourseHub } from "../../_components/course-hub";
import { GradebookActions } from "./gradebook-actions";

export const dynamic = "force-dynamic";

const STATUS_TONE = { DRAFT: "gray", SUBMITTED: "blue", LOCKED: "purple" } as const;

export default async function CourseGradebookPage(props: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await props.params;
  const user = await requireCurrentUser();
  const courseResult = await load(() => getCourse(user, courseId));
  if (!courseResult.ok) return <ServiceError error={courseResult.error} />;
  const course = courseResult.data;
  const bookResult = await load(() => courseGradebook(user, courseId));
  if (!bookResult.ok) {
    return (
      <div>
        <CourseHub course={course} tab="gradebook" />
        <ServiceError error={bookResult.error} />
      </div>
    );
  }
  const book = bookResult.data;
  const canGrade = user.teacherId === course.teacherId || isAdmin(user);
  const columns = [
    ...book.assignments.map((a) => ({ key: `a:${a.id}`, id: a.id, kind: "assignment" as const, title: a.title, maxScore: a.maxScore, sub: `Due ${fmtDate(a.dueDate)}` })),
    ...book.assessments.map((a) => ({ key: `s:${a.id}`, id: a.id, kind: "assessment" as const, title: a.title, maxScore: a.maxScore, sub: `${a.type.toLowerCase()} · weight ${a.weight}` })),
  ];

  return (
    <div>
      <CourseHub course={course} tab="gradebook" />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Draft" value={book.status.pending} tone={book.status.pending ? "warn" : "default"} hint="not yet visible to students" />
        <StatCard label="Submitted" value={book.status.submitted} tone="info" />
        <StatCard label="Locked" value={book.status.locked} />
        <StatCard label="Missing" value={book.status.missing} tone={book.status.missing ? "bad" : "good"} hint="student × item without a grade" />
      </div>
      {canGrade && (
        <div className="mb-4">
          <GradebookActions courseId={course.id} pending={book.status.pending} />
        </div>
      )}
      {columns.length === 0 ? (
        <EmptyState title="Nothing to grade yet" description="Create an assignment or an assessment to start the gradebook." />
      ) : (
        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2">Student</th>
                  {columns.map((c) => (
                    <th key={c.key} className="px-3 py-2 align-top">
                      {c.kind === "assignment" ? (
                        <Link href={`/assignments/${c.id}`} className="normal-case tracking-normal text-slate-800 hover:text-brand-700">
                          {c.title}
                        </Link>
                      ) : (
                        <span className="normal-case tracking-normal text-slate-800">{c.title}</span>
                      )}
                      <div className="text-[10px] font-normal normal-case tracking-normal text-slate-400">
                        /{c.maxScore} · {c.sub}
                      </div>
                    </th>
                  ))}
                  <th className="px-3 py-2">Average</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {book.rows.map((r) => (
                  <tr key={r.student.id} data-testid="row" data-id={r.student.id} className="hover:bg-slate-50/60">
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-2">
                      <Link href={`/students/${r.student.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                        {studentName(r.student)}
                      </Link>
                    </td>
                    {columns.map((c) => {
                      const g = r.grades.find((x) => (c.kind === "assignment" ? x.assignmentId === c.id : x.assessmentId === c.id));
                      return (
                        <td key={c.key} className="px-3 py-2 text-slate-700">
                          {g ? (
                            <span className="inline-flex items-center gap-1" title={`${g.status.toLowerCase()}${g.comment ? ` · ${g.comment}` : ""}`}>
                              {g.score}
                              <Badge tone={STATUS_TONE[g.status]} className="px-1 py-0 text-[10px]">
                                {g.letter ?? g.status.charAt(0)}
                              </Badge>
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 font-medium text-slate-900">
                      {r.summary.average === null ? "—" : `${r.summary.average}% (${r.summary.letter})`}
                      <span className="ml-1 text-xs font-normal text-slate-400">
                        {r.summary.graded}/{r.summary.total}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
