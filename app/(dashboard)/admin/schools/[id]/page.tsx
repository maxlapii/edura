import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getSchool } from "@/modules/schools";
import { Alert, Card, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { EntityForm } from "../../_components/entity-form";
import { guarded } from "../../_lib/guard";
import type { PageProps } from "../../_lib/types";

export const dynamic = "force-dynamic";

export default async function SchoolDetailPage({ params }: PageProps<{ id: string }>) {
  const { id } = await params;
  const user = await requireCurrentUser();
  const res = await guarded(() => getSchool(user, id));
  if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
  const school = res.data;
  const admins = user.role === "SUPER_ADMIN" ? await prisma.user.findMany({ where: { schoolId: id, role: { in: ["SCHOOL_ADMIN", "PRINCIPAL"] } }, select: { id: true, name: true, email: true, role: true, isActive: true }, orderBy: { name: "asc" } }) : [];
  return (
    <div className="space-y-6">
      <PageHeader
        title={school.name}
        description={`Code ${school.code} · ${school.timezone}`}
        breadcrumb={
          <Link href="/admin/schools" className="hover:underline">
            Schools
          </Link>
        }
        actions={<StatusBadge status={school.isActive ? "ACTIVE" : "INACTIVE"} />}
      />
      <Card title="School details">
        <EntityForm
          testId="school-form"
          method="PATCH"
          action={`/api/schools/${school.id}`}
          initial={school as unknown as Record<string, unknown>}
          fields={[
            { name: "name", label: "Name", required: true },
            { name: "code", label: "Code", required: true },
            { name: "address", label: "Address", className: "sm:col-span-2", nullable: true },
            { name: "phone", label: "Phone", nullable: true },
            { name: "email", label: "Email", type: "email", nullable: true },
            { name: "timezone", label: "Timezone" },
            { name: "isActive", label: "Active", type: "checkbox" },
          ]}
        />
      </Card>
      {user.role === "SUPER_ADMIN" && (
        <>
          <Card title="School administrators">
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Email</TH>
                  <TH>Role</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {admins.map((u) => (
                  <TR key={u.id} data-testid="row" data-id={u.id}>
                    <TD>{u.name}</TD>
                    <TD>{u.email}</TD>
                    <TD>
                      <StatusBadge status={u.role} />
                    </TD>
                    <TD>
                      <StatusBadge status={u.isActive ? "ACTIVE" : "INACTIVE"} />
                    </TD>
                  </TR>
                ))}
                {admins.length === 0 && (
                  <TR>
                    <TD colSpan={4} className="text-center text-slate-500">
                      No administrators yet. Create one below.
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </Card>
          <Card title="Create school administrator" description="Leave the password empty to generate a temporary one.">
            <EntityForm
              testId="school-admin-form"
              action="/api/users"
              submitLabel="Create administrator"
              resetOnSuccess
              initial={{ role: "SCHOOL_ADMIN", schoolId: school.id }}
              fields={[
                { name: "name", label: "Name", required: true },
                { name: "email", label: "Email", type: "email", required: true },
                { name: "password", label: "Password", type: "password", hint: "Optional – at least 8 characters" },
                { name: "phone", label: "Phone" },
                { name: "role", label: "Role", type: "hidden" },
                { name: "schoolId", label: "School", type: "hidden" },
              ]}
            />
          </Card>
        </>
      )}
    </div>
  );
}
