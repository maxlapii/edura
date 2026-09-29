import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { getStudent } from "@/modules/students";
import { Alert, Badge, Card, DescriptionList, LinkButton, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { fmtDate, humanize } from "@/lib/format";
import { ActionButton } from "../../_components/action-button";
import { EntityForm } from "../../_components/entity-form";
import { TemporaryPasswordNotice } from "../../_components/temporary-password";
import { guarded, str } from "../../_lib/guard";
import { classOptions, guardianOptions } from "../../_lib/options";
import type { PageProps } from "../../_lib/types";
import { studentFields } from "../_fields";
import { LinkGuardianForm } from "./link-guardian-form";

export const dynamic = "force-dynamic";

export default async function StudentDetailPage({ params, searchParams }: PageProps<{ id: string }>) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const user = await requireCurrentUser();
  const res = await guarded(() => getStudent(user, id));
  if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
  const student = res.data;
  const [classes, guardians] = await Promise.all([classOptions(user), guardianOptions(user)]);
  const linked = new Set(student.guardians.map((g) => g.guardianId));
  return (
    <div className="space-y-6">
      <TemporaryPasswordNotice entityId={student.id} password={str(sp, "tempPassword")} />
      <PageHeader
        title={`${student.firstName} ${student.lastName}`}
        description={`${student.studentNumber} · ${student.class ? student.class.name : "No class"}${student.class?.academicYear ? ` · ${student.class.academicYear.name}` : ""}`}
        breadcrumb={
          <Link href="/admin/students" className="hover:underline">
            Students
          </Link>
        }
        actions={
          <>
            <StatusBadge status={student.status} />
            <LinkButton href={`/students/${student.id}`} variant="outline" size="sm">
              Student profile
            </LinkButton>
            {student.user && (
              <LinkButton href={`/admin/users/${student.user.id}`} variant="outline" size="sm">
                Login &amp; password
              </LinkButton>
            )}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Profile">
            <EntityForm testId="student-form" method="PATCH" action={`/api/students/${student.id}`} initial={student as unknown as Record<string, unknown>} fields={studentFields({ classes, mode: "edit" })} />
          </Card>
          <Card title="Guardians">
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Contact</TH>
                  <TH>Relationship</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {student.guardians.map((g) => (
                  <TR key={g.guardianId} data-testid="guardian-row" data-id={g.guardianId}>
                    <TD>
                      <Link href={`/admin/guardians/${g.guardianId}`} className="font-medium text-brand-700 hover:underline">
                        {g.guardian.user.name}
                      </Link>
                    </TD>
                    <TD>
                      <div>{g.guardian.user.email}</div>
                      <div className="text-xs text-slate-500">{g.guardian.user.phone ?? "—"}</div>
                    </TD>
                    <TD>
                      {g.relationship} {g.isPrimary && <Badge tone="blue">Primary</Badge>}
                    </TD>
                    <TD className="text-right">
                      <ActionButton action={`/api/guardians/${g.guardianId}/students?studentId=${student.id}`} method="DELETE" label="Unlink" variant="danger" confirm="Unlink this guardian?" testId="unlink-guardian" />
                    </TD>
                  </TR>
                ))}
                {student.guardians.length === 0 && (
                  <TR>
                    <TD colSpan={4} className="text-center text-slate-500">
                      No guardians linked.
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Link guardian" description="Link an existing parent/guardian account.">
            <LinkGuardianForm studentId={student.id} guardians={guardians.filter((g) => !linked.has(g.value))} />
            <p className="mt-3 text-xs text-slate-500">
              Need a new guardian? <Link href="/admin/guardians/new" className="text-brand-700 hover:underline">Create one</Link>.
            </p>
          </Card>
          <Card title="Summary">
            <DescriptionList
              items={[
                { label: "Login", value: student.user ? student.user.email : "No login" },
                { label: "Homeroom teacher", value: student.class?.homeroomTeacher?.user.name ?? "—" },
                { label: "Date of birth", value: fmtDate(student.dateOfBirth) },
                { label: "Enrolled", value: fmtDate(student.enrollmentDate) },
                { label: "Support cases", value: student.supportCases.length },
                { label: "Incidents", value: student.disciplineIncidents.length },
              ]}
            />
          </Card>
          {student.supportCases.length > 0 && (
            <Card title="Recent support cases">
              <ul className="divide-y divide-slate-100 text-sm">
                {student.supportCases.map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-1.5">
                    <Link href={`/admin/support-cases/${c.id}`} className="hover:text-brand-700">
                      {c.title} <span className="text-xs text-slate-500">· {humanize(c.category)}</span>
                    </Link>
                    <StatusBadge status={c.status} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
