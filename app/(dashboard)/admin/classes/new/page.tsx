import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { Alert, Card, PageHeader } from "@/components/ui";
import { EntityForm } from "../../_components/entity-form";
import { academicYearOptions, allTeacherOptions, roomOptions } from "../../_lib/options";

export const dynamic = "force-dynamic";

export default async function NewClassPage() {
  const user = await requireCurrentUser();
  const [years, teachers, rooms] = await Promise.all([academicYearOptions(user), allTeacherOptions(user), roomOptions(user)]);
  const current = years.find((y) => y.label.includes("(current)"))?.value ?? years[0]?.value ?? "";
  return (
    <div className="space-y-6">
      <PageHeader
        title="Add class"
        breadcrumb={
          <Link href="/admin/classes" className="hover:underline">
            Classes
          </Link>
        }
      />
      {years.length === 0 && (
        <Alert tone="warning">
          No academic year exists yet. <Link href="/admin/academic-years" className="underline">Create one first</Link>.
        </Alert>
      )}
      <Card>
        <EntityForm
          testId="class-form"
          action="/api/classes"
          redirectTo="/admin/classes/{id}"
          submitLabel="Create class"
          cancelHref="/admin/classes"
          initial={{ academicYearId: current }}
          fields={[
            { name: "academicYearId", label: "Academic year", type: "select", options: years, required: true },
            { name: "name", label: "Class name", required: true, placeholder: "Grade 10A" },
            { name: "gradeLevel", label: "Grade level", type: "number", min: 0, max: 20 },
            { name: "capacity", label: "Capacity", type: "number", min: 1, max: 500 },
            { name: "homeroomTeacherId", label: "Homeroom teacher", type: "select", options: teachers },
            { name: "roomId", label: "Room", type: "select", options: rooms },
          ]}
        />
      </Card>
    </div>
  );
}
