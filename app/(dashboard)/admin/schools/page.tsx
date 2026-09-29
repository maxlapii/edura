import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { listSchools } from "@/modules/schools";
import { Alert, Card, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { EntityForm } from "../_components/entity-form";

export const dynamic = "force-dynamic";

export default async function SchoolsPage() {
  const user = await requireCurrentUser();
  if (user.role !== "SUPER_ADMIN") return <Alert tone="error">Only super administrators can manage schools.</Alert>;
  const schools = await listSchools(user);
  return (
    <div className="space-y-6">
      <PageHeader title="Schools" description="Every school on this Edura installation." />
      <Table>
        <THead>
          <TR>
            <TH>Name</TH>
            <TH>Code</TH>
            <TH>Timezone</TH>
            <TH>Email</TH>
            <TH>Status</TH>
            <TH>Created</TH>
          </TR>
        </THead>
        <TBody>
          {schools.map((s) => (
            <TR key={s.id} data-testid="row" data-id={s.id}>
              <TD>
                <Link href={`/admin/schools/${s.id}`} className="font-medium text-brand-700 hover:underline">
                  {s.name}
                </Link>
              </TD>
              <TD>{s.code}</TD>
              <TD>{s.timezone}</TD>
              <TD>{s.email ?? "—"}</TD>
              <TD>
                <StatusBadge status={s.isActive ? "ACTIVE" : "INACTIVE"} />
              </TD>
              <TD>{fmtDate(s.createdAt)}</TD>
            </TR>
          ))}
          {schools.length === 0 && (
            <TR>
              <TD colSpan={6} className="text-center text-slate-500">
                No schools yet.
              </TD>
            </TR>
          )}
        </TBody>
      </Table>
      <Card title="Create school" description="Default periods and automation rules are installed automatically.">
        <EntityForm
          testId="school-form"
          action="/api/schools"
          submitLabel="Create school"
          redirectTo="/admin/schools/{id}"
          fields={[
            { name: "name", label: "Name", required: true },
            { name: "code", label: "Code", required: true, hint: "Letters, digits, - and _" },
            { name: "address", label: "Address", className: "sm:col-span-2" },
            { name: "phone", label: "Phone" },
            { name: "email", label: "Email", type: "email" },
            { name: "timezone", label: "Timezone", placeholder: "UTC" },
          ]}
          initial={{ timezone: "UTC" }}
        />
      </Card>
    </div>
  );
}
