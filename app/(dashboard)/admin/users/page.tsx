import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { listUsers } from "@/modules/users";
import type { Role } from "@/generated/prisma/enums";
import { Alert, PageHeader, Pagination, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { fmtDate, humanize } from "@/lib/format";
import { EntityForm } from "../_components/entity-form";
import { FilterBar, FilterField, FilterInput, FilterSelect } from "../_components/filter-bar";
import { guarded, int, qs, str } from "../_lib/guard";
import { enumOptions } from "../_lib/options";
import type { PageProps } from "../_lib/types";
import { CreatePanel } from "@/app/(dashboard)/_components/create-panel";

export const dynamic = "force-dynamic";

const ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "DEPARTMENT_HEAD", "TEACHER", "STUDENT", "PARENT", "STAFF"] as const;

export default async function UsersPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const user = await requireCurrentUser();
  const query = { q: str(sp, "q"), role: str(sp, "role") as Role | undefined, isActive: str(sp, "isActive") as "true" | "false" | undefined, page: int(sp, "page", 1), pageSize: 25 };
  const res = await guarded(() => listUsers(user, query));
  if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
  const { items, total, page, totalPages } = res.data;
  const creatable = user.role === "SUPER_ADMIN" ? ROLES : ROLES.filter((r) => r !== "SUPER_ADMIN");
  return (
    <div className="space-y-4">
      <PageHeader title="Users" description={`${total} user accounts`} />
      <FilterBar action="/admin/users">
        <FilterField label="Search">
          <FilterInput name="q" defaultValue={query.q} placeholder="Name or email" />
        </FilterField>
        <FilterField label="Role">
          <FilterSelect name="role" defaultValue={query.role ?? ""} options={enumOptions(ROLES)} />
        </FilterField>
        <FilterField label="Active">
          <FilterSelect name="isActive" defaultValue={query.isActive ?? ""} options={[{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }]} />
        </FilterField>
      </FilterBar>
      <div className="flex flex-col gap-4">
        <div className="min-w-0">
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Email</TH>
                <TH>Role</TH>
                <TH>Created</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((u) => (
                <TR key={u.id} data-testid="row" data-id={u.id}>
                  <TD>
                    <Link href={`/admin/users/${u.id}`} className="font-medium text-brand-700 hover:underline">
                      {u.name}
                    </Link>
                  </TD>
                  <TD>{u.email}</TD>
                  <TD>{humanize(u.role)}</TD>
                  <TD>{fmtDate(u.createdAt)}</TD>
                  <TD>
                    <StatusBadge status={u.isActive ? "ACTIVE" : "INACTIVE"} />
                  </TD>
                </TR>
              ))}
              {items.length === 0 && (
                <TR>
                  <TD colSpan={5} className="text-center text-slate-500">
                    No users found.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
          <Pagination page={page} totalPages={totalPages} hrefFor={(p) => `/admin/users${qs({ ...query, page: p })}`} />
        </div>
        <CreatePanel className="order-first" title="Create user" description="For teachers, staff, students and guardians prefer the dedicated pages so the profile is created too.">
          <EntityForm
            testId="user-form"
            action="/api/users"
            idPath="user.id"
            redirectTo="/admin/users/{id}"
            submitLabel="Create user"
            columns={3}
            compact
            initial={{ role: "STAFF" }}
            fields={[
              { name: "name", label: "Name", required: true },
              { name: "email", label: "Email", type: "email", required: true },
              { name: "role", label: "Role", type: "select", options: enumOptions(creatable), required: true },
              { name: "password", label: "Password", type: "password", hint: "Optional – leave empty to generate a temporary password" },
              { name: "phone", label: "Phone" },
            ]}
          />
        </CreatePanel>
      </div>
    </div>
  );
}
