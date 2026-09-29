import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { listDepartments } from "@/modules/departments";
import { Alert, Card, PageHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { ActionButton } from "../_components/action-button";
import { EntityForm } from "../_components/entity-form";
import { guarded } from "../_lib/guard";
import { allTeacherOptions } from "../_lib/options";

export const dynamic = "force-dynamic";

export default async function DepartmentsPage() {
  const user = await requireCurrentUser();
  const res = await guarded(() => listDepartments(user));
  if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
  const departments = res.data;
  const teachers = await allTeacherOptions(user);
  return (
    <div className="space-y-6">
      <PageHeader title="Departments" description="Departments group teachers, subjects and department heads." />
      <Table>
        <THead>
          <TR>
            <TH>Name</TH>
            <TH>Code</TH>
            <TH>Head</TH>
            <TH>Teachers</TH>
            <TH>Subjects</TH>
            <TH className="text-right">Actions</TH>
          </TR>
        </THead>
        <TBody>
          {departments.map((d) => (
            <TR key={d.id} data-testid="row" data-id={d.id}>
              <TD>
                <Link href={`/admin/departments/${d.id}`} className="font-medium text-brand-700 hover:underline">
                  {d.name}
                </Link>
              </TD>
              <TD>{d.code}</TD>
              <TD>{d.headTeacher?.user.name ?? "—"}</TD>
              <TD>{d._count.teachers}</TD>
              <TD>{d._count.subjects}</TD>
              <TD className="text-right">
                <ActionButton action={`/api/departments/${d.id}`} method="DELETE" label="Delete" variant="danger" confirm={`Delete department ${d.name}?`} testId="delete" />
              </TD>
            </TR>
          ))}
          {departments.length === 0 && (
            <TR>
              <TD colSpan={6} className="text-center text-slate-500">
                No departments yet.
              </TD>
            </TR>
          )}
        </TBody>
      </Table>
      <Card title="Create department">
        <EntityForm
          testId="department-form"
          action="/api/departments"
          submitLabel="Create department"
          redirectTo="/admin/departments/{id}"
          fields={[
            { name: "name", label: "Name", required: true },
            { name: "code", label: "Code", required: true },
            { name: "description", label: "Description", type: "textarea", className: "sm:col-span-2" },
            { name: "headTeacherId", label: "Department head", type: "select", options: teachers },
          ]}
        />
      </Card>
    </div>
  );
}
