import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { listClasses } from "@/modules/classes";
import { Alert, LinkButton, PageHeader, Pagination, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { FilterBar, FilterField, FilterInput, FilterSelect } from "../_components/filter-bar";
import { guarded, int, qs, str } from "../_lib/guard";
import { academicYearOptions } from "../_lib/options";
import type { PageProps } from "../_lib/types";

export const dynamic = "force-dynamic";

export default async function ClassesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const user = await requireCurrentUser();
  const query = { q: str(sp, "q"), academicYearId: str(sp, "academicYearId"), page: int(sp, "page", 1), pageSize: 50 };
  const res = await guarded(() => listClasses(user, query));
  if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
  const { items, total, page, totalPages } = res.data;
  const years = await academicYearOptions(user);
  return (
    <div className="space-y-4">
      <PageHeader title="Classes & courses" description={`${total} classes`} actions={<LinkButton href="/admin/classes/new" data-testid="new-class">Add class</LinkButton>} />
      <FilterBar action="/admin/classes">
        <FilterField label="Search">
          <FilterInput name="q" defaultValue={query.q} placeholder="Class name" />
        </FilterField>
        <FilterField label="Academic year">
          <FilterSelect name="academicYearId" defaultValue={query.academicYearId ?? ""} options={years} />
        </FilterField>
      </FilterBar>
      <Table>
        <THead>
          <TR>
            <TH>Class</TH>
            <TH>Grade</TH>
            <TH>Year</TH>
            <TH>Homeroom teacher</TH>
            <TH>Room</TH>
            <TH>Students</TH>
            <TH>Courses</TH>
          </TR>
        </THead>
        <TBody>
          {items.map((c) => (
            <TR key={c.id} data-testid="row" data-id={c.id}>
              <TD>
                <Link href={`/admin/classes/${c.id}`} className="font-medium text-brand-700 hover:underline">
                  {c.name}
                </Link>
              </TD>
              <TD>{c.gradeLevel ?? "—"}</TD>
              <TD>{c.academicYear.name}</TD>
              <TD>{c.homeroomTeacher?.user.name ?? "—"}</TD>
              <TD>{c.room?.name ?? "—"}</TD>
              <TD>
                {c._count.students}
                {c.capacity ? ` / ${c.capacity}` : ""}
              </TD>
              <TD>{c._count.courses}</TD>
            </TR>
          ))}
          {items.length === 0 && (
            <TR>
              <TD colSpan={7} className="text-center text-slate-500">
                No classes found.
              </TD>
            </TR>
          )}
        </TBody>
      </Table>
      <Pagination page={page} totalPages={totalPages} hrefFor={(p) => `/admin/classes${qs({ ...query, page: p })}`} />
    </div>
  );
}
