import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { listStudents } from "@/modules/students";
import { Alert, LinkButton, PageHeader, Pagination, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { FilterBar, FilterField, FilterInput, FilterSelect } from "../_components/filter-bar";
import { guarded, int, qs, str } from "../_lib/guard";
import { classOptions, enumOptions } from "../_lib/options";
import type { PageProps } from "../_lib/types";
import { STUDENT_STATUSES } from "./_fields";

export const dynamic = "force-dynamic";

export default async function StudentsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const user = await requireCurrentUser();
  const query = { q: str(sp, "q"), classId: str(sp, "classId"), status: str(sp, "status"), page: int(sp, "page", 1), pageSize: 25 };
  const res = await guarded(() => listStudents(user, query));
  if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
  const { items, total, page, totalPages } = res.data;
  const classes = await classOptions(user);
  return (
    <div className="space-y-4">
      <PageHeader title="Students" description={`${total} students`} actions={<LinkButton href="/admin/students/new" data-testid="new-student">Add student</LinkButton>} />
      <FilterBar action="/admin/students">
        <FilterField label="Search">
          <FilterInput name="q" defaultValue={query.q} placeholder="Name or student #" />
        </FilterField>
        <FilterField label="Class">
          <FilterSelect name="classId" defaultValue={query.classId ?? ""} options={classes} />
        </FilterField>
        <FilterField label="Status">
          <FilterSelect name="status" defaultValue={query.status ?? ""} options={enumOptions(STUDENT_STATUSES)} />
        </FilterField>
      </FilterBar>
      <Table>
        <THead>
          <TR>
            <TH>Name</TH>
            <TH>Student #</TH>
            <TH>Class</TH>
            <TH>Enrolled</TH>
            <TH>Login</TH>
            <TH>Status</TH>
          </TR>
        </THead>
        <TBody>
          {items.map((s) => (
            <TR key={s.id} data-testid="row" data-id={s.id}>
              <TD>
                <Link href={`/admin/students/${s.id}`} className="font-medium text-brand-700 hover:underline">
                  {s.lastName}, {s.firstName}
                </Link>
              </TD>
              <TD>{s.studentNumber}</TD>
              <TD>{s.class ? <Link href={`/admin/classes/${s.class.id}`} className="hover:underline">{s.class.name}</Link> : "—"}</TD>
              <TD>{fmtDate(s.enrollmentDate)}</TD>
              <TD>{s.user ? s.user.email : <span className="text-slate-400">none</span>}</TD>
              <TD>
                <StatusBadge status={s.status} />
              </TD>
            </TR>
          ))}
          {items.length === 0 && (
            <TR>
              <TD colSpan={6} className="text-center text-slate-500">
                No students found.
              </TD>
            </TR>
          )}
        </TBody>
      </Table>
      <Pagination page={page} totalPages={totalPages} hrefFor={(p) => `/admin/students${qs({ ...query, page: p })}`} />
    </div>
  );
}
