import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { listMyCourses } from "@/modules/classes";
import { Alert, Card, PageHeader } from "@/components/ui";
import { ServiceError } from "../../_components/service-error";
import { load } from "../../_lib/load";
import { param, type SearchParams } from "../../_lib/helpers";
import { LessonPlanForm } from "../_components/lesson-plan-form";

export const dynamic = "force-dynamic";

export default async function NewLessonPlanPage(props: { searchParams: Promise<SearchParams> }) {
  const sp = await props.searchParams;
  const user = await requireCurrentUser();
  if (user.studentId || user.guardianId) return <Alert tone="error">Only teachers can create lesson plans.</Alert>;
  const result = await load(() => listMyCourses(user));
  if (!result.ok) return <ServiceError error={result.error} />;
  const options = result.data.map((c) => ({ id: c.id, label: `${c.subject.name} · ${c.class.name}` }));
  const preselected = param(sp, "courseId");

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="New lesson plan"
        breadcrumb={
          <Link href="/lesson-plans" className="hover:underline">
            Lesson plans
          </Link>
        }
      />
      {options.length === 0 ? (
        <Alert tone="info">You do not have any courses yet.</Alert>
      ) : (
        <Card>
          <LessonPlanForm courses={options} initial={{ courseId: options.some((o) => o.id === preselected) ? preselected : options[0].id, date: param(sp, "date") ?? "" }} />
        </Card>
      )}
    </div>
  );
}
