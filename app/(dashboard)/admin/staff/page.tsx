import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { listStaff } from "@/modules/staff";
import { Alert, LinkButton, PageHeader, Pagination, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { humanize } from "@/lib/format";
import { FilterBar, FilterField, FilterInput, FilterSelect } from "../_components/filter-bar";
import { guarded, int, qs, str } from "../_lib/guard";
import { enumOptions } from "../_lib/options";
import type { PageProps } from "../_lib/types";
import { STAFF_STATUSES, STAFF_TYPES } from "./_fields";

export const dynamic = "force-dynamic";

export default async function StaffPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const user = await requireCurrentUser();
  const query = { q: str(sp, "q"), staffType: str(sp, "staffType"), status: str(sp, "status"), page: int(sp, "page", 1), pageSize: 25 };
  const res = await guarded(() => listStaff(user, query));
  if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
  const { items, total, page, totalPages } = res.data;
  return (
    <div className="space-y-4">
      <PageHeader title="Staff" description={`${total} non-teaching staff members`} actions={<LinkButton href="/admin/staff/new" data-testid="new-staff">Add staff member</LinkButton>} />
      <FilterBar action="/admin/staff">
        <FilterField label="Search">
          <FilterInput name="q" defaultValue={query.q} placeholder="Name or employee #" />
        </FilterField>
        <FilterField label="Type">
          <FilterSelect name="staffType" defaultValue={query.staffType ?? ""} options={enumOptions(STAFF_TYPES)} />
        </FilterField>
        <FilterField label="Status">
          <FilterSelect name="status" defaultValue={query.status ?? ""} options={enumOptions(STAFF_STATUSES)} />
        </FilterField>
      </FilterBar>
      <Table>
        <THead>
          <TR>
            <TH>Name</TH>
            <TH>Employee #</TH>
            <TH>Type</TH>
            <TH>Department</TH>
            <TH>Position</TH>
            <TH>Role</TH>
            <TH>Status</TH>
          </TR>
        </THead>
        <TBody>
          {items.map((s) => (
            <TR key={s.id} data-testid="row" data-id={s.id}>
              <TD>
                <Link href={`/admin/staff/${s.id}`} className="font-medium text-brand-700 hover:underline">
                  {s.user.name}
                </Link>
                <div className="text-xs text-slate-500">{s.user.email}</div>
              </TD>
              <TD>{s.employeeNumber}</TD>
              <TD>{humanize(s.staffType)}</TD>
              <TD>{s.department?.name ?? "—"}</TD>
              <TD>{s.position ?? "—"}</TD>
              <TD>{humanize(s.user.role)}</TD>
              <TD>
                <StatusBadge status={s.status} />
              </TD>
            </TR>
          ))}
          {items.length === 0 && (
            <TR>
              <TD colSpan={7} className="text-center text-slate-500">
                No staff found.
              </TD>
            </TR>
          )}
        </TBody>
      </Table>
      <Pagination page={page} totalPages={totalPages} hrefFor={(p) => `/admin/staff${qs({ ...query, page: p })}`} />
    </div>
  );
}
