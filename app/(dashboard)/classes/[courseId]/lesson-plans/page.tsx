import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { getCourse } from "@/modules/classes";
import { curriculumProgress, listLessonPlans } from "@/modules/lessonPlans";
import { Card, EmptyState, LinkButton, StatCard, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { ServiceError } from "../../../_components/service-error";
import { load } from "../../../_lib/load";
import { CourseHub } from "../../_components/course-hub";

export const dynamic = "force-dynamic";

export default async function CourseLessonPlansPage(props: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await props.params;
  const user = await requireCurrentUser();
  const result = await load(async () => {
    const course = await getCourse(user, courseId);
    const [plans, progress] = await Promise.all([listLessonPlans(user, { courseId }), curriculumProgress(user, courseId)]);
    return { course, plans, progress };
  });
  if (!result.ok) return <ServiceError error={result.error} />;
  const { course, plans, progress } = result.data;
  const canPlan = !user.studentId && !user.guardianId;

  return (
    <div>
      <CourseHub
        course={course}
        tab="lesson-plans"
        actions={
          canPlan ? (
            <LinkButton href={`/lesson-plans/new?courseId=${course.id}`} size="sm" data-testid="new-lesson-plan">
              New lesson plan
            </LinkButton>
          ) : undefined
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Curriculum progress" value={`${progress.completionRate}%`} hint={`${progress.COMPLETED} of ${progress.total} lessons completed`} tone="info" />
        <StatCard label="Draft" value={progress.DRAFT} />
        <StatCard label="Ready" value={progress.READY} />
        <StatCard label="Completed" value={progress.COMPLETED} tone="good" />
      </div>
      {plans.length === 0 ? (
        <EmptyState title="No lesson plans for this course" action={canPlan ? <LinkButton href={`/lesson-plans/new?courseId=${course.id}`}>Create a lesson plan</LinkButton> : undefined} />
      ) : (
        <Card padded={false}>
          <Table className="border-0">
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Title</TH>
                <TH>Topic</TH>
                <TH>Teacher</TH>
                <TH>Status</TH>
              </tr>
            </THead>
            <TBody>
              {plans.map((p) => (
                <TR key={p.id} data-testid="row" data-id={p.id}>
                  <TD className="whitespace-nowrap">{fmtDate(p.date)}</TD>
                  <TD>
                    <Link href={`/lesson-plans/${p.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {p.title}
                    </Link>
                    {p.aiGenerated && <span className="ml-2 text-xs text-purple-700">AI draft</span>}
                  </TD>
                  <TD className="text-slate-500">{p.curriculumTopic ?? "—"}</TD>
                  <TD className="text-slate-500">{p.teacher.user.name}</TD>
                  <TD>
                    <StatusBadge status={p.status} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
