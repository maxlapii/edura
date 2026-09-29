import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { getDepartment } from "@/modules/departments";
import { Alert, Card, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { ActionButton } from "../../_components/action-button";
import { EntityForm } from "../../_components/entity-form";
import { guarded } from "../../_lib/guard";
import { allTeacherOptions } from "../../_lib/options";
import type { PageProps } from "../../_lib/types";

export const dynamic = "force-dynamic";

export default async function DepartmentDetailPage({ params }: PageProps<{ id: string }>) {
  const { id } = await params;
  const user = await requireCurrentUser();
  const res = await guarded(() => getDepartment(user, id));
  if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
  const dept = res.data;
  const teachers = await allTeacherOptions(user);
  return (
    <div className="space-y-6">
      <PageHeader
        title={dept.name}
        description={`Code ${dept.code}${dept.headTeacher ? ` · Head: ${dept.headTeacher.user.name}` : ""}`}
        breadcrumb={
          <Link href="/admin/departments" className="hover:underline">
            Departments
          </Link>
        }
        actions={<ActionButton action={`/api/departments/${dept.id}`} method="DELETE" label="Delete department" variant="danger" confirm={`Delete ${dept.name}?`} redirectTo="/admin/departments" testId="delete" />}
      />
      <Card title="Edit department">
        <EntityForm
          testId="department-form"
          method="PATCH"
          action={`/api/departments/${dept.id}`}
          initial={dept as unknown as Record<string, unknown>}
          fields={[
            { name: "name", label: "Name", required: true },
            { name: "code", label: "Code", required: true },
            { name: "description", label: "Description", type: "textarea", className: "sm:col-span-2", nullable: true },
            { name: "headTeacherId", label: "Department head", type: "select", options: teachers, nullable: true },
          ]}
        />
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`Teachers (${dept.teachers.length})`}>
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Employee #</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {dept.teachers.map((t) => (
                <TR key={t.id} data-testid="teacher-row" data-id={t.id}>
                  <TD>
                    <Link href={`/admin/teachers/${t.id}`} className="text-brand-700 hover:underline">
                      {t.user.name}
                    </Link>
                  </TD>
                  <TD>{t.employeeNumber}</TD>
                  <TD>
                    <StatusBadge status={t.status} />
                  </TD>
                </TR>
              ))}
              {dept.teachers.length === 0 && (
                <TR>
                  <TD colSpan={3} className="text-center text-slate-500">
                    No teachers in this department.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </Card>
        <Card title={`Subjects (${dept.subjects.length})`} actions={<Link href="/admin/subjects" className="text-xs text-brand-700 hover:underline">Manage subjects</Link>}>
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Code</TH>
              </TR>
            </THead>
            <TBody>
              {dept.subjects.map((s) => (
                <TR key={s.id} data-testid="subject-row" data-id={s.id}>
                  <TD>{s.name}</TD>
                  <TD>{s.code}</TD>
                </TR>
              ))}
              {dept.subjects.length === 0 && (
                <TR>
                  <TD colSpan={2} className="text-center text-slate-500">
                    No subjects assigned.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
