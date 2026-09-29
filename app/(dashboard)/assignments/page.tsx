import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { listAssignments, type AssignmentFilter } from "@/modules/assignments";
import { Badge, Card, EmptyState, LinkButton, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { FilterTabs } from "../_components/filter-tabs";
import { ServiceError } from "../_components/service-error";
import { load } from "../_lib/load";
import { param, type SearchParams } from "../_lib/helpers";

export const dynamic = "force-dynamic";

const FILTERS: Array<{ value: AssignmentFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "missing", label: "Missing" },
  { value: "submitted", label: "Submitted" },
  { value: "late", label: "Late" },
  { value: "graded", label: "Graded" },
  { value: "overdue", label: "Overdue" },
  { value: "upcoming", label: "Upcoming" },
];
const STUDENT_FILTERS = FILTERS.filter((f) => f.value !== "late");
const PARENT_FILTERS = FILTERS.filter((f) => ["all", "overdue", "upcoming"].includes(f.value));

export default async function AssignmentsPage(props: { searchParams: Promise<SearchParams> }) {
  const sp = await props.searchParams;
  const user = await requireCurrentUser();
  const raw = param(sp, "filter") ?? "all";
  const filter = (FILTERS.some((f) => f.value === raw) ? raw : "all") as AssignmentFilter;
  const result = await load(() => listAssignments(user, { filter }));
  if (!result.ok) return <ServiceError error={result.error} />;
  const assignments = result.data;
  const isStudent = !!user.studentId;
  const isParent = !!user.guardianId;
  const canCreate = !isStudent && !isParent;
  const tabs = isStudent ? STUDENT_FILTERS : isParent ? PARENT_FILTERS : FILTERS;
  const now = new Date();

  return (
    <div>
      <PageHeader
        title="Assignments"
        description={isStudent ? "Your assignments and submission status." : isParent ? "Assignments for your children's classes." : "Assignments across your courses."}
        actions={
          canCreate ? (
            <LinkButton href="/assignments/new" size="sm" data-testid="new-assignment">
              New assignment
            </LinkButton>
          ) : undefined
        }
      />
      <FilterTabs items={tabs} current={filter} hrefFor={(v) => (v === "all" ? "/assignments" : `/assignments?filter=${v}`)} />
      {assignments.length === 0 ? (
        <EmptyState title="No assignments" description={filter === "all" ? "Nothing here yet." : "No assignments match this filter."} />
      ) : (
        <Card padded={false}>
          <Table className="border-0">
            <THead>
              <tr>
                <TH>Title</TH>
                <TH>Course</TH>
                <TH>Due</TH>
                {isStudent ? <TH>My submission</TH> : <TH>Status</TH>}
                {!isStudent && !isParent && <TH>Submissions</TH>}
              </tr>
            </THead>
            <TBody>
              {assignments.map((a) => {
                const sub = "submissions" in a && Array.isArray(a.submissions) ? a.submissions[0] : undefined;
                const overdue = a.dueDate < now;
                return (
                  <TR key={a.id} data-testid="row" data-id={a.id}>
                    <TD>
                      <Link href={`/assignments/${a.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                        {a.title}
                      </Link>
                    </TD>
                    <TD className="text-slate-500">
                      {a.course.subject.name} · {a.course.class.name}
                    </TD>
                    <TD className={overdue ? "text-slate-500" : ""}>{fmtDateTime(a.dueDate)}</TD>
                    {isStudent ? (
                      <TD>
                        {sub ? (
                          <span className="inline-flex items-center gap-1">
                            <StatusBadge status={sub.status} />
                            {sub.isLate && <Badge tone="amber">Late</Badge>}
                          </span>
                        ) : overdue ? (
                          <Badge tone="red">Missing</Badge>
                        ) : (
                          <Badge tone="gray">Not submitted</Badge>
                        )}
                      </TD>
                    ) : (
                      <TD>
                        <StatusBadge status={a.status} />
                      </TD>
                    )}
                    {!isStudent && !isParent && <TD>{a._count.submissions}</TD>}
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
