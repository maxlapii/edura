import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { Card, PageHeader } from "@/components/ui";
import { EntityForm } from "../../_components/entity-form";
import { classOptions } from "../../_lib/options";
import { studentFields } from "../_fields";

export const dynamic = "force-dynamic";

export default async function NewStudentPage() {
  const user = await requireCurrentUser();
  const classes = await classOptions(user);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Add student"
        breadcrumb={
          <Link href="/admin/students" className="hover:underline">
            Students
          </Link>
        }
      />
      <Card>
        <EntityForm testId="student-form" action="/api/students" idPath="student.id" redirectTo="/admin/students/{id}" submitLabel="Create student" cancelHref="/admin/students" fields={studentFields({ classes, mode: "create" })} />
      </Card>
    </div>
  );
}
