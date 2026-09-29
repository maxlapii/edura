import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { listSupportCases } from "@/modules/supportCases";
import { Alert, Badge, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { fmtDate, humanize } from "@/lib/format";
import { EntityForm } from "../_components/entity-form";
import { FilterBar, FilterField, FilterSelect } from "../_components/filter-bar";
import { guarded, str } from "../_lib/guard";
import { enumOptions, staffUserOptions, studentOptions } from "../_lib/options";
import type { PageProps } from "../_lib/types";
import { CASE_CATEGORIES, CASE_STATUSES } from "./_fields";
import { CreatePanel } from "@/app/(dashboard)/_components/create-panel";

export const dynamic = "force-dynamic";

export default async function SupportCasesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const user = await requireCurrentUser();
  const status = str(sp, "status") as (typeof CASE_STATUSES)[number] | undefined;
  const category = str(sp, "category") as (typeof CASE_CATEGORIES)[number] | undefined;
  const assignedToUserId = str(sp, "assignedToUserId");
  const res = await guarded(() => listSupportCases(user, { status, category, assignedToUserId }));
  if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
  const cases = res.data;
  const [students, users] = await Promise.all([studentOptions(user), staffUserOptions(user)]);
  return (
    <div className="space-y-4">
      <PageHeader title="Student support" description="Structured academic, attendance, behaviour and wellbeing cases." />
      <FilterBar action="/admin/support-cases">
        <FilterField label="Status">
          <FilterSelect name="status" defaultValue={status ?? ""} options={enumOptions(CASE_STATUSES)} />
        </FilterField>
        <FilterField label="Category">
          <FilterSelect name="category" defaultValue={category ?? ""} options={enumOptions(CASE_CATEGORIES)} />
        </FilterField>
        <FilterField label="Assigned to">
          <FilterSelect name="assignedToUserId" defaultValue={assignedToUserId ?? ""} options={users} />
        </FilterField>
      </FilterBar>
      <div className="flex flex-col gap-4">
        <div className="min-w-0">
          <Table>
            <THead>
              <TR>
                <TH>Case</TH>
                <TH>Student</TH>
                <TH>Category</TH>
                <TH>Assigned</TH>
                <TH>Follow-up</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {cases.map((c) => (
                <TR key={c.id} data-testid="row" data-id={c.id}>
                  <TD>
                    <Link href={`/admin/support-cases/${c.id}`} className="font-medium text-brand-700 hover:underline">
                      {c.title}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {c._count.notes} notes {c.isSensitive && <Badge tone="purple">Sensitive</Badge>}
                    </div>
                  </TD>
                  <TD>
                    <Link href={`/admin/students/${c.student.id}`} className="hover:underline">
                      {c.student.firstName} {c.student.lastName}
                    </Link>
                    <div className="text-xs text-slate-500">{c.student.class?.name ?? "—"}</div>
                  </TD>
                  <TD>{humanize(c.category)}</TD>
                  <TD>{c.assignedTo?.name ?? <span className="text-slate-400">unassigned</span>}</TD>
                  <TD>{fmtDate(c.followUpDate)}</TD>
                  <TD>
                    <StatusBadge status={c.status} />
                  </TD>
                </TR>
              ))}
              {cases.length === 0 && (
                <TR>
                  <TD colSpan={6} className="text-center text-slate-500">
                    No support cases.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </div>
        <CreatePanel className="order-first" title="Open a case">
          <EntityForm
            testId="support-case-form"
            action="/api/support-cases"
            submitLabel="Create case"
            redirectTo="/admin/support-cases/{id}"
            columns={3}
            compact
            initial={{ category: "OTHER" }}
            fields={[
              { name: "studentId", label: "Student", type: "select", options: students, required: true, placeholder: "Select a student…" },
              { name: "category", label: "Category", type: "select", options: enumOptions(CASE_CATEGORIES), required: true },
              { name: "title", label: "Title", required: true },
              { name: "description", label: "Description", type: "textarea", rows: 4 },
              { name: "isSensitive", label: "Sensitive (restricted visibility)", type: "checkbox" },
              { name: "assignedToUserId", label: "Assign to", type: "select", options: users },
              { name: "followUpDate", label: "Follow-up date", type: "date", hint: "Creates a follow-up task for the assignee" },
            ]}
          />
        </CreatePanel>
      </div>
    </div>
  );
}
