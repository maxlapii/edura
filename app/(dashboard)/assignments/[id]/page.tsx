import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/permissions";
import { getAssignment } from "@/modules/assignments";
import { Alert, Badge, Card, DescriptionList, EmptyState, PageHeader, StatCard, StatusBadge } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { Disclosure } from "../../_components/disclosure";
import { ServiceError } from "../../_components/service-error";
import { load } from "../../_lib/load";
import { asAttachments, studentName } from "../../_lib/helpers";
import { AssignmentForm } from "../_components/assignment-form";
import { GradingForm, type GradingRow } from "./grading-form";
import { SubmitForm } from "./submit-form";

export const dynamic = "force-dynamic";

export default async function AssignmentPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = await requireCurrentUser();
  const result = await load(() => getAssignment(user, id));
  if (!result.ok) return <ServiceError error={result.error} />;
  const a = result.data;
  const attachments = asAttachments(a.attachments);
  const overdue = a.dueDate < new Date();
  const isStudent = !!user.studentId;
  const isParent = !!user.guardianId;
  const canManage = !isStudent && !isParent && (isAdmin(user) || a.course.teacherId === user.teacherId);
  const counts: Record<string, number> = "counts" in a && a.counts ? a.counts : {};

  const header = (
    <PageHeader
      title={a.title}
      breadcrumb={
        <>
          <Link href="/assignments" className="hover:underline">
            Assignments
          </Link>{" "}
          /{" "}
          <Link href={`/classes/${a.courseId}/assignments`} className="hover:underline">
            {a.course.subject.name} · {a.course.class.name}
          </Link>
        </>
      }
      description={
        <>
          Due {fmtDateTime(a.dueDate)} · {a.maxScore} points · {a.course.teacher.user.name}
        </>
      }
      actions={
        <>
          <StatusBadge status={a.status} />
          {overdue && a.status === "PUBLISHED" && <Badge tone="amber">Past due</Badge>}
        </>
      }
    />
  );

  const details = (
    <Card title="Details">
      {a.description ? <p className="whitespace-pre-wrap text-sm text-slate-800">{a.description}</p> : <p className="text-sm text-slate-500">No description.</p>}
      {attachments.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {attachments.map((f) => (
            <li key={f.url}>
              <a href={f.url} className="text-brand-700 hover:underline" target="_blank" rel="noreferrer">
                {f.name}
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );

  // ── Student ──
  if (isStudent) {
    const submission = a.submissions[0] ?? null;
    const grade = a.grades[0] ?? null;
    const canSubmit = a.status === "PUBLISHED" && !grade;
    return (
      <div className="space-y-6">
        {header}
        {details}
        <Card title="My submission" actions={submission ? <span className="inline-flex gap-1"><StatusBadge status={submission.status} />{submission.isLate && <Badge tone="amber">Late</Badge>}</span> : undefined}>
          {submission ? (
            <div className="space-y-2 text-sm">
              <p className="text-slate-500">Submitted {fmtDateTime(submission.submittedAt)}</p>
              {submission.content && <pre className="whitespace-pre-wrap rounded bg-slate-50 p-3 text-slate-800">{submission.content}</pre>}
              {submission.feedback && (
                <div>
                  <div className="text-xs font-medium uppercase text-slate-500">Teacher feedback</div>
                  <p className="text-slate-800">{submission.feedback}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">{overdue ? "You have not submitted this assignment. It is past due, so your submission will be marked late." : "You have not submitted this assignment yet."}</p>
          )}
        </Card>
        {grade && (
          <Card title="Grade">
            <DescriptionList items={[{ label: "Score", value: `${grade.score} / ${grade.maxScore}${grade.letter ? ` (${grade.letter})` : ""}` }, { label: "Comment", value: grade.comment ?? "—" }, { label: "Status", value: <StatusBadge status={grade.status} /> }]} />
          </Card>
        )}
        {canSubmit ? (
          <Card title={submission ? "Resubmit" : "Submit your work"}>
            <SubmitForm assignmentId={a.id} initialContent={submission?.content} resubmit={!!submission} />
          </Card>
        ) : (
          !grade && <Alert tone="info">This assignment is {a.status.toLowerCase()} and no longer accepts submissions.</Alert>
        )}
      </div>
    );
  }

  // ── Parent (read-only) ──
  if (isParent) {
    return (
      <div className="space-y-6">
        {header}
        {details}
        <Card title="Your children">
          {a.submissions.length === 0 && a.grades.length === 0 ? (
            <p className="text-sm text-slate-500">No submission yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {a.submissions.map((s) => {
                const g = a.grades.find((x) => x.studentId === s.studentId);
                return (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2" data-testid="row" data-id={s.studentId}>
                    <span className="font-medium">{studentName(s.student)}</span>
                    <span className="flex items-center gap-2">
                      <StatusBadge status={s.status} />
                      {s.isLate && <Badge tone="amber">Late</Badge>}
                      <span className="text-slate-500">{fmtDateTime(s.submittedAt)}</span>
                      {g && <span className="font-medium">{g.score} / {g.maxScore}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    );
  }

  // ── Teacher / admin ──
  const rows: GradingRow[] = a.roster.map((r) => ({
    studentId: r.student.id,
    name: studentName(r.student),
    studentNumber: r.student.studentNumber,
    state: r.state,
    submittedAt: r.submission?.submittedAt.toISOString() ?? null,
    isLate: r.submission?.isLate ?? false,
    content: r.submission?.content ?? null,
    score: r.grade?.score ?? null,
    comment: r.grade?.comment ?? null,
    gradeStatus: r.grade?.status ?? null,
  }));

  return (
    <div className="space-y-6">
      {header}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Students" value={a.roster.length} />
        <StatCard label="Submitted" value={counts.SUBMITTED ?? 0} tone="info" />
        <StatCard label="Late" value={counts.LATE ?? 0} tone={counts.LATE ? "warn" : "default"} />
        <StatCard label="Missing" value={counts.MISSING ?? 0} tone={counts.MISSING ? "bad" : "default"} />
        <StatCard label="Graded" value={counts.GRADED ?? 0} tone="good" />
      </div>
      {details}
      {canManage && (
        <Card title="Edit assignment">
          <Disclosure label="Edit" testId="edit-assignment">
            <AssignmentForm courses={[]} assignmentId={a.id} initial={{ title: a.title, description: a.description ?? "", dueDate: a.dueDate.toISOString(), maxScore: a.maxScore, status: a.status }} />
          </Disclosure>
        </Card>
      )}
      <Card title="Submissions & grading" description={canManage ? "Enter scores and feedback; grades are saved as drafts." : "Only the course teacher can enter grades."}>
        {rows.length === 0 ? (
          <EmptyState title="No students in this class" />
        ) : canManage ? (
          <GradingForm assignmentId={a.id} maxScore={a.maxScore} rows={rows} />
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {rows.map((r) => (
              <li key={r.studentId} className="flex items-center justify-between py-2" data-testid="row" data-id={r.studentId}>
                <Link href={`/students/${r.studentId}`} className="font-medium hover:text-brand-700">
                  {r.name}
                </Link>
                <span className="flex items-center gap-2">
                  <StatusBadge status={r.state} />
                  {r.score !== null && <span>{r.score} / {a.maxScore}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
