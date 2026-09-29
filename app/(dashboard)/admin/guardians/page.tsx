import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { listGuardians } from "@/modules/guardians";
import { Alert, LinkButton, PageHeader, Pagination, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { FilterBar, FilterField, FilterInput } from "../_components/filter-bar";
import { guarded, int, qs, str } from "../_lib/guard";
import type { PageProps } from "../_lib/types";

export const dynamic = "force-dynamic";

export default async function GuardiansPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const user = await requireCurrentUser();
  const query = { q: str(sp, "q"), page: int(sp, "page", 1), pageSize: 25 };
  const res = await guarded(() => listGuardians(user, query));
  if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
  const { items, total, page, totalPages } = res.data;
  return (
    <div className="space-y-4">
      <PageHeader title="Parents & guardians" description={`${total} guardians`} actions={<LinkButton href="/admin/guardians/new" data-testid="new-guardian">Add guardian</LinkButton>} />
      <FilterBar action="/admin/guardians">
        <FilterField label="Search">
          <FilterInput name="q" defaultValue={query.q} placeholder="Name or email" />
        </FilterField>
      </FilterBar>
      <Table>
        <THead>
          <TR>
            <TH>Name</TH>
            <TH>Contact</TH>
            <TH>Children</TH>
            <TH>Login</TH>
          </TR>
        </THead>
        <TBody>
          {items.map((g) => (
            <TR key={g.id} data-testid="row" data-id={g.id}>
              <TD>
                <Link href={`/admin/guardians/${g.id}`} className="font-medium text-brand-700 hover:underline">
                  {g.user.name}
                </Link>
              </TD>
              <TD>
                <div>{g.user.email}</div>
                <div className="text-xs text-slate-500">{g.phone ?? g.user.phone ?? "—"}</div>
              </TD>
              <TD>
                {g.students.map((s) => (
                  <Link key={s.student.id} href={`/admin/students/${s.student.id}`} className="mr-2 hover:underline">
                    {s.student.firstName} {s.student.lastName}
                    {s.student.class ? ` (${s.student.class.name})` : ""}
                  </Link>
                ))}
                {g.students.length === 0 && <span className="text-slate-400">none</span>}
              </TD>
              <TD>
                <StatusBadge status={g.user.isActive ? "ACTIVE" : "INACTIVE"} />
              </TD>
            </TR>
          ))}
          {items.length === 0 && (
            <TR>
              <TD colSpan={4} className="text-center text-slate-500">
                No guardians found.
              </TD>
            </TR>
          )}
        </TBody>
      </Table>
      <Pagination page={page} totalPages={totalPages} hrefFor={(p) => `/admin/guardians${qs({ ...query, page: p })}`} />
    </div>
  );
}
