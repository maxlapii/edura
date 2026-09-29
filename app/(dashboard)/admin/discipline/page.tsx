import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { listIncidents } from "@/modules/discipline";
import { Alert, Badge, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { fmtDate, humanize } from "@/lib/format";
import { EntityForm } from "../_components/entity-form";
import { FilterBar, FilterField, FilterInput, FilterSelect } from "../_components/filter-bar";
import { dateParam, guarded, str } from "../_lib/guard";
import { enumOptions, studentOptions } from "../_lib/options";
import type { PageProps } from "../_lib/types";
import { SEVERITIES, incidentFields } from "./_fields";
import { CreatePanel } from "@/app/(dashboard)/_components/create-panel";

export const dynamic = "force-dynamic";

const SEVERITY_TONE = { MINOR: "gray", MODERATE: "amber", MAJOR: "red", SEVERE: "red" } as const;

export default async function DisciplinePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const user = await requireCurrentUser();
  const severity = str(sp, "severity") as (typeof SEVERITIES)[number] | undefined;
  const studentId = str(sp, "studentId");
  const res = await guarded(() => listIncidents(user, { severity, studentId, from: dateParam(sp, "from"), to: dateParam(sp, "to") }));
  if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
  const incidents = res.data;
  const students = await studentOptions(user);
  return (
    <div className="space-y-4">
      <PageHeader title="Discipline" description="Factual, auditable record of behaviour incidents." />
      <FilterBar action="/admin/discipline">
        <FilterField label="Severity">
          <FilterSelect name="severity" defaultValue={severity ?? ""} options={enumOptions(SEVERITIES)} />
        </FilterField>
        <FilterField label="Student">
          <FilterSelect name="studentId" defaultValue={studentId ?? ""} options={students} />
        </FilterField>
        <FilterField label="From">
          <FilterInput name="from" type="date" defaultValue={str(sp, "from")} />
        </FilterField>
        <FilterField label="To">
          <FilterInput name="to" type="date" defaultValue={str(sp, "to")} />
        </FilterField>
      </FilterBar>
      <div className="flex flex-col gap-4">
        <div className="min-w-0">
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Student</TH>
                <TH>Category</TH>
                <TH>Severity</TH>
                <TH>Reported by</TH>
                <TH>Parent</TH>
              </TR>
            </THead>
            <TBody>
              {incidents.map((i) => (
                <TR key={i.id} data-testid="row" data-id={i.id}>
                  <TD>
                    <Link href={`/admin/discipline/${i.id}`} className="font-medium text-brand-700 hover:underline">
                      {fmtDate(i.date)}
                    </Link>
                  </TD>
                  <TD>
                    <Link href={`/admin/students/${i.student.id}`} className="hover:underline">
                      {i.student.firstName} {i.student.lastName}
                    </Link>
                    <div className="text-xs text-slate-500">{i.student.class?.name ?? "—"}</div>
                  </TD>
                  <TD>{i.category}</TD>
                  <TD>
                    <Badge tone={SEVERITY_TONE[i.severity]}>{humanize(i.severity)}</Badge>
                  </TD>
                  <TD>{i.reportedBy.name}</TD>
                  <TD>{i.parentNotified ? <StatusBadge status="DONE" /> : <span className="text-xs text-slate-400">not notified</span>}</TD>
                </TR>
              ))}
              {incidents.length === 0 && (
                <TR>
                  <TD colSpan={6} className="text-center text-slate-500">
                    No incidents recorded.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </div>
        <CreatePanel className="order-first" title="Record incident">
          <EntityForm testId="incident-form" action="/api/discipline" submitLabel="Record incident" redirectTo="/admin/discipline/{id}" columns={3} compact initial={{ severity: "MINOR", date: new Date() }} fields={incidentFields({ students, mode: "create" })} />
        </CreatePanel>
      </div>
    </div>
  );
}
