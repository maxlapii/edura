import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { listTeachers } from "@/modules/teachers";
import { Alert, LinkButton, PageHeader, Pagination, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { humanize } from "@/lib/format";
import { FilterBar, FilterField, FilterInput, FilterSelect } from "../_components/filter-bar";
import { guarded, int, qs, str } from "../_lib/guard";
import { departmentOptions, enumOptions } from "../_lib/options";
import type { PageProps } from "../_lib/types";
import { TEACHER_STATUSES } from "./_fields";

export const dynamic = "force-dynamic";

export default async function TeachersPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const user = await requireCurrentUser();
  const query = { q: str(sp, "q"), departmentId: str(sp, "departmentId"), status: str(sp, "status"), page: int(sp, "page", 1), pageSize: 25 };
  const res = await guarded(() => listTeachers(user, query));
  if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
  const { items, total, page, totalPages } = res.data;
  const departments = await departmentOptions(user);
  return (
    <div className="space-y-4">
      <PageHeader title="Teachers" description={`${total} teachers`} actions={<LinkButton href="/admin/teachers/new" data-testid="new-teacher">Add teacher</LinkButton>} />
      <FilterBar action="/admin/teachers">
        <FilterField label="Search">
          <FilterInput name="q" defaultValue={query.q} placeholder="Name, email or employee #" />
        </FilterField>
        <FilterField label="Department">
          <FilterSelect name="departmentId" defaultValue={query.departmentId ?? ""} options={departments} />
        </FilterField>
        <FilterField label="Status">
          <FilterSelect name="status" defaultValue={query.status ?? ""} options={enumOptions(TEACHER_STATUSES)} />
        </FilterField>
      </FilterBar>
      <Table>
        <THead>
          <TR>
            <TH>Name</TH>
            <TH>Employee #</TH>
            <TH>Department</TH>
            <TH>Subjects</TH>
            <TH>Type</TH>
            <TH>Lessons/week</TH>
            <TH>Status</TH>
          </TR>
        </THead>
        <TBody>
          {items.map((t) => (
            <TR key={t.id} data-testid="row" data-id={t.id}>
              <TD>
                <Link href={`/admin/teachers/${t.id}`} className="font-medium text-brand-700 hover:underline">
                  {t.user.name}
                </Link>
                <div className="text-xs text-slate-500">{t.user.email}</div>
              </TD>
              <TD>{t.employeeNumber}</TD>
              <TD>{t.department?.name ?? "—"}</TD>
              <TD className="max-w-xs truncate">{t.subjects.map((s) => s.subject.name).join(", ") || "—"}</TD>
              <TD>{humanize(t.employmentType)}</TD>
              <TD>
                {t._count.timetableSlots} / {t.maxWeeklyPeriods}
              </TD>
              <TD>
                <StatusBadge status={t.status} />
              </TD>
            </TR>
          ))}
          {items.length === 0 && (
            <TR>
              <TD colSpan={7} className="text-center text-slate-500">
                No teachers found.
              </TD>
            </TR>
          )}
        </TBody>
      </Table>
      <Pagination page={page} totalPages={totalPages} hrefFor={(p) => `/admin/teachers${qs({ ...query, page: p })}`} />
    </div>
  );
}
