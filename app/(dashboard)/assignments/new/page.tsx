import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { listMyCourses } from "@/modules/classes";
import { Alert, Card, PageHeader } from "@/components/ui";
import { ServiceError } from "../../_components/service-error";
import { load } from "../../_lib/load";
import { defaultDueDate, param, type SearchParams } from "../../_lib/helpers";
import { AssignmentForm } from "../_components/assignment-form";

export const dynamic = "force-dynamic";

export default async function NewAssignmentPage(props: { searchParams: Promise<SearchParams> }) {
  const sp = await props.searchParams;
  const user = await requireCurrentUser();
  if (user.studentId || user.guardianId) return <Alert tone="error">Only teachers can create assignments.</Alert>;
  const result = await load(() => listMyCourses(user));
  if (!result.ok) return <ServiceError error={result.error} />;
  // Only courses the caller actually teaches can receive assignments (service rule).
  const courses = result.data.filter((c) => !user.teacherId || c.teacherId === user.teacherId || user.role !== "TEACHER");
  const options = courses.map((c) => ({ id: c.id, label: `${c.subject.name} · ${c.class.name}` }));
  const preselected = param(sp, "courseId");

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="New assignment"
        breadcrumb={
          <Link href="/assignments" className="hover:underline">
            Assignments
          </Link>
        }
      />
      {options.length === 0 ? (
        <Alert tone="info">You do not teach any courses yet, so there is nowhere to post an assignment.</Alert>
      ) : (
        <Card>
          <AssignmentForm courses={options} initial={{ courseId: options.some((o) => o.id === preselected) ? preselected : options[0].id, dueDate: defaultDueDate().toISOString() }} />
        </Card>
      )}
    </div>
  );
}
