import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { listStudents } from "@/modules/students";
import { listMyCourses } from "@/modules/classes";
import { Button, Card, EmptyState, Input, PageHeader, Pagination, Select, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { ServiceError } from "../_components/service-error";
import { load } from "../_lib/load";
import { pageParam, param, qs, type SearchParams } from "../_lib/helpers";

export const dynamic = "force-dynamic";

export default async function StudentsPage(props: { searchParams: Promise<SearchParams> }) {
  const sp = await props.searchParams;
  const user = await requireCurrentUser();
  const q = param(sp, "q")?.trim() || undefined;
  const classId = param(sp, "classId") || undefined;
  const page = pageParam(sp);
  const result = await load(async () => {
    const [students, courses] = await Promise.all([listStudents(user, { q, classId, page, pageSize: 25 }), listMyCourses(user)]);
    const classes = [...new Map(courses.map((c) => [c.class.id, c.class])).values()].sort((a, b) => a.name.localeCompare(b.name));
    return { students, classes };
  });
  if (!result.ok) return <ServiceError error={result.error} />;
  const { students, classes } = result.data;

  return (
    <div>
      <PageHeader title="Students" description={`${students.total} student${students.total === 1 ? "" : "s"} in your classes`} />
      <form method="get" action="/students" className="mb-4 flex flex-wrap items-end gap-2" role="search">
        <Input name="q" defaultValue={q ?? ""} placeholder="Search name or student number" className="w-64" aria-label="Search students" />
        <Select name="classId" defaultValue={classId ?? ""} className="w-48" aria-label="Class">
          <option value="">All classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
        {(q || classId) && (
          <Link href="/students" className="text-sm text-brand-700 hover:underline">
            Clear
          </Link>
        )}
      </form>
      {students.items.length === 0 ? (
        <EmptyState title="No students found" description={q || classId ? "Try a different search or class." : "Students in the classes you teach will appear here."} />
      ) : (
        <Card padded={false}>
          <Table className="border-0">
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Student number</TH>
                <TH>Class</TH>
                <TH>Status</TH>
              </tr>
            </THead>
            <TBody>
              {students.items.map((s) => (
                <TR key={s.id} data-testid="row" data-id={s.id}>
                  <TD>
                    <Link href={`/students/${s.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {s.lastName}, {s.firstName}
                    </Link>
                  </TD>
                  <TD className="text-slate-500">{s.studentNumber}</TD>
                  <TD>{s.class?.name ?? "—"}</TD>
                  <TD>
                    <StatusBadge status={s.status} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <div className="px-3 pb-3">
            <Pagination page={students.page} totalPages={students.totalPages} hrefFor={(p) => `/students${qs({ q, classId, page: p })}`} />
          </div>
        </Card>
      )}
    </div>
  );
}
