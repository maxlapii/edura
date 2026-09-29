import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { listSubjects } from "@/modules/subjects";
import { Alert, Card, PageHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { ActionButton } from "../_components/action-button";
import { EntityForm } from "../_components/entity-form";
import { guarded, str } from "../_lib/guard";
import { departmentOptions } from "../_lib/options";
import type { PageProps } from "../_lib/types";

export const dynamic = "force-dynamic";

export default async function SubjectsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const editId = str(sp, "edit");
  const user = await requireCurrentUser();
  const res = await guarded(() => listSubjects(user));
  if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
  const subjects = res.data;
  const departments = await departmentOptions(user);
  const editing = editId ? subjects.find((s) => s.id === editId) : undefined;
  const fields = [
    { name: "name", label: "Name", required: true },
    { name: "code", label: "Code", required: true },
    { name: "departmentId", label: "Department", type: "select" as const, options: departments, nullable: true },
  ];
  return (
    <div className="space-y-6">
      <PageHeader title="Subjects" description="Subjects are taught as courses in classes." />
      <Table>
        <THead>
          <TR>
            <TH>Name</TH>
            <TH>Code</TH>
            <TH>Department</TH>
            <TH className="text-right">Actions</TH>
          </TR>
        </THead>
        <TBody>
          {subjects.map((s) => (
            <TR key={s.id} data-testid="row" data-id={s.id}>
              <TD className="font-medium">{s.name}</TD>
              <TD>{s.code}</TD>
              <TD>{s.department?.name ?? "—"}</TD>
              <TD className="text-right">
                <span className="inline-flex items-center gap-2">
                  <Link href={`/admin/subjects?edit=${s.id}`} className="text-xs text-brand-700 hover:underline">
                    Edit
                  </Link>
                  <ActionButton action={`/api/subjects/${s.id}`} method="DELETE" label="Delete" variant="danger" confirm={`Delete subject ${s.name}?`} testId="delete" />
                </span>
              </TD>
            </TR>
          ))}
          {subjects.length === 0 && (
            <TR>
              <TD colSpan={4} className="text-center text-slate-500">
                No subjects yet.
              </TD>
            </TR>
          )}
        </TBody>
      </Table>
      {editing ? (
        <Card title={`Edit ${editing.name}`} actions={<Link href="/admin/subjects" className="text-xs text-slate-600 hover:underline">Cancel</Link>}>
          <EntityForm testId="subject-form" method="PATCH" action={`/api/subjects/${editing.id}`} initial={editing as unknown as Record<string, unknown>} fields={fields} redirectTo="/admin/subjects" />
        </Card>
      ) : (
        <Card title="Create subject">
          <EntityForm testId="subject-form" action="/api/subjects" submitLabel="Create subject" resetOnSuccess fields={fields} />
        </Card>
      )}
    </div>
  );
}
