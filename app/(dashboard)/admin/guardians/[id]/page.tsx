import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { getGuardian } from "@/modules/guardians";
import { Alert, Badge, Card, DescriptionList, LinkButton, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { ActionButton } from "../../_components/action-button";
import { EntityForm } from "../../_components/entity-form";
import { TemporaryPasswordNotice } from "../../_components/temporary-password";
import { guarded, str } from "../../_lib/guard";
import { studentOptions } from "../../_lib/options";
import type { PageProps } from "../../_lib/types";

export const dynamic = "force-dynamic";

export default async function GuardianDetailPage({ params, searchParams }: PageProps<{ id: string }>) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const user = await requireCurrentUser();
  const res = await guarded(() => getGuardian(user, id));
  if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
  const guardian = res.data;
  const linked = new Set(guardian.students.map((s) => s.studentId));
  const students = (await studentOptions(user)).filter((s) => !linked.has(s.value));
  return (
    <div className="space-y-6">
      <TemporaryPasswordNotice entityId={guardian.id} password={str(sp, "tempPassword")} />
      <PageHeader
        title={guardian.user.name}
        description={guardian.user.email}
        breadcrumb={
          <Link href="/admin/guardians" className="hover:underline">
            Parents &amp; guardians
          </Link>
        }
        actions={
          <LinkButton href={`/admin/users/${guardian.user.id}`} variant="outline" size="sm">
            Login &amp; password
          </LinkButton>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Profile">
            <EntityForm
              testId="guardian-form"
              method="PATCH"
              action={`/api/guardians/${guardian.id}`}
              initial={{ name: guardian.user.name, phone: guardian.phone ?? guardian.user.phone, address: guardian.address }}
              fields={[
                { name: "name", label: "Full name", required: true },
                { name: "phone", label: "Phone", nullable: true },
                { name: "address", label: "Address", className: "sm:col-span-2", nullable: true },
              ]}
            />
          </Card>
          <Card title="Linked children">
            <Table>
              <THead>
                <TR>
                  <TH>Student</TH>
                  <TH>Class</TH>
                  <TH>Relationship</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {guardian.students.map((s) => (
                  <TR key={s.studentId} data-testid="student-row" data-id={s.studentId}>
                    <TD>
                      <Link href={`/admin/students/${s.studentId}`} className="font-medium text-brand-700 hover:underline">
                        {s.student.firstName} {s.student.lastName}
                      </Link>
                      <div className="text-xs text-slate-500">{s.student.studentNumber}</div>
                    </TD>
                    <TD>{s.student.class?.name ?? "—"}</TD>
                    <TD>
                      {s.relationship} {s.isPrimary && <Badge tone="blue">Primary</Badge>}
                    </TD>
                    <TD className="text-right">
                      <ActionButton action={`/api/guardians/${guardian.id}/students?studentId=${s.studentId}`} method="DELETE" label="Unlink" variant="danger" confirm="Unlink this student?" testId="unlink-student" />
                    </TD>
                  </TR>
                ))}
                {guardian.students.length === 0 && (
                  <TR>
                    <TD colSpan={4} className="text-center text-slate-500">
                      No students linked.
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Link student">
            <EntityForm
              testId="link-student-form"
              action={`/api/guardians/${guardian.id}/students`}
              submitLabel="Link student"
              resetOnSuccess
              columns={1}
              compact
              initial={{ relationship: "PARENT" }}
              fields={[
                { name: "studentId", label: "Student", type: "select", options: students, required: true, placeholder: "Select a student…" },
                { name: "relationship", label: "Relationship" },
                { name: "isPrimary", label: "Primary contact", type: "checkbox" },
              ]}
            />
          </Card>
          <Card title="Account">
            <DescriptionList items={[{ label: "Login", value: <StatusBadge status={guardian.user.isActive ? "ACTIVE" : "INACTIVE"} /> }, { label: "Phone", value: guardian.phone ?? guardian.user.phone ?? "—" }]} />
          </Card>
        </div>
      </div>
    </div>
  );
}
