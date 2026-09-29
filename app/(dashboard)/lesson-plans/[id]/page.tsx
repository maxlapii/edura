import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/permissions";
import { getLessonPlan } from "@/modules/lessonPlans";
import { Card, DescriptionList, PageHeader, StatusBadge } from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { ActionButton } from "../../_components/action-button";
import { Disclosure } from "../../_components/disclosure";
import { ServiceError } from "../../_components/service-error";
import { load } from "../../_lib/load";
import { ymd } from "../../_lib/helpers";
import { LessonPlanForm } from "../_components/lesson-plan-form";

export const dynamic = "force-dynamic";

export default async function LessonPlanPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = await requireCurrentUser();
  const result = await load(() => getLessonPlan(user, id));
  if (!result.ok) return <ServiceError error={result.error} />;
  const plan = result.data;
  const canEdit = isAdmin(user) || plan.teacherId === user.teacherId;
  const canCopy = !user.studentId && !user.guardianId;
  const sections: Array<{ label: string; value: string | null }> = [
    { label: "Learning objectives", value: plan.objectives },
    { label: "Activities", value: plan.activities },
    { label: "Materials", value: plan.materials },
    { label: "Homework", value: plan.homework },
    { label: "Notes", value: plan.notes },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={plan.title}
        breadcrumb={
          <>
            <Link href="/lesson-plans" className="hover:underline">
              Lesson plans
            </Link>{" "}
            /{" "}
            <Link href={`/classes/${plan.courseId}/lesson-plans`} className="hover:underline">
              {plan.course.subject.name} · {plan.course.class.name}
            </Link>
          </>
        }
        description={
          <>
            {fmtDate(plan.date)}
            {plan.timetableSlot ? ` · ${plan.timetableSlot.period.name}` : ""} · {plan.teacher.user.name}
            {plan.aiGenerated ? " · AI-assisted draft" : ""}
          </>
        }
        actions={
          <>
            <StatusBadge status={plan.status} />
            {canEdit && plan.status !== "COMPLETED" && <ActionButton method="PATCH" path={`/api/lesson-plans/${plan.id}`} json={{ status: "COMPLETED" }} label="Mark completed" busyLabel="Saving…" testId="mark-completed" />}
            {canCopy && <ActionButton method="POST" path={`/api/lesson-plans/${plan.id}/copy`} json={{}} label="Copy" busyLabel="Copying…" redirectPrefix="/lesson-plans/" testId="copy-plan" />}
            {canEdit && <ActionButton method="DELETE" path={`/api/lesson-plans/${plan.id}`} label="Delete" variant="danger" confirmText="Delete this lesson plan?" redirectTo="/lesson-plans" testId="delete-plan" />}
          </>
        }
      />

      <Card title="Overview">
        <DescriptionList items={[{ label: "Course", value: `${plan.course.subject.name} · ${plan.course.class.name}` }, { label: "Curriculum topic", value: plan.curriculumTopic ?? "—" }, { label: "Completed", value: plan.completedAt ? fmtDateTime(plan.completedAt) : "—" }, { label: "Last updated", value: fmtDateTime(plan.updatedAt) }]} />
      </Card>

      {sections.map((s) => (
        <Card key={s.label} title={s.label}>
          {s.value ? <p className="whitespace-pre-wrap text-sm text-slate-800">{s.value}</p> : <p className="text-sm text-slate-400">Not filled in.</p>}
        </Card>
      ))}

      {canEdit && (
        <Card title="Edit">
          <Disclosure label="Edit lesson plan" testId="edit-plan">
            <LessonPlanForm
              courses={[]}
              planId={plan.id}
              initial={{
                courseId: plan.courseId,
                title: plan.title,
                date: plan.date ? ymd(plan.date) : "",
                curriculumTopic: plan.curriculumTopic ?? "",
                objectives: plan.objectives ?? "",
                activities: plan.activities ?? "",
                materials: plan.materials ?? "",
                homework: plan.homework ?? "",
                notes: plan.notes ?? "",
                status: plan.status,
              }}
            />
          </Disclosure>
        </Card>
      )}
    </div>
  );
}
