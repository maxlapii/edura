import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { Card, PageHeader } from "@/components/ui";
import { EntityForm } from "../../_components/entity-form";
import { departmentOptions, subjectOptions } from "../../_lib/options";
import { teacherFields } from "../_fields";

export const dynamic = "force-dynamic";

export default async function NewTeacherPage() {
  const user = await requireCurrentUser();
  const [departments, subjects] = await Promise.all([departmentOptions(user), subjectOptions(user)]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Add teacher"
        description="Creates the teacher profile and a login. A temporary password is generated when none is given."
        breadcrumb={
          <Link href="/admin/teachers" className="hover:underline">
            Teachers
          </Link>
        }
      />
      <Card>
        <EntityForm testId="teacher-form" action="/api/teachers" idPath="teacher.id" redirectTo="/admin/teachers/{id}" submitLabel="Create teacher" cancelHref="/admin/teachers" initial={{ employmentType: "FULL_TIME", maxWeeklyPeriods: 25 }} fields={teacherFields({ departments, subjects, mode: "create" })} />
      </Card>
    </div>
  );
}
