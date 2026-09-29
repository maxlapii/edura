import { requireCurrentUser } from "@/lib/auth/session";
import { listAcademicYears } from "@/modules/academic";
import { Alert, Badge, Card, PageHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { ActionButton } from "../_components/action-button";
import { EntityForm } from "../_components/entity-form";
import { guarded } from "../_lib/guard";

export const dynamic = "force-dynamic";

export default async function AcademicYearsPage() {
  const user = await requireCurrentUser();
  const res = await guarded(() => listAcademicYears(user));
  if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
  const years = res.data;
  const yearOptions = years.map((y) => ({ value: y.id, label: y.name }));
  return (
    <div className="space-y-6">
      <PageHeader title="Academic years" description="Years, terms and which one is current." />
      {years.length === 0 && <Alert tone="info">No academic year yet. Create one below – classes and timetables belong to an academic year.</Alert>}
      {years.map((y) => (
        <Card
          key={y.id}
          title={
            <span className="inline-flex items-center gap-2">
              {y.name} {y.isCurrent && <Badge tone="green">Current</Badge>}
            </span>
          }
          description={`${fmtDate(y.startDate)} → ${fmtDate(y.endDate)}`}
          actions={!y.isCurrent && <ActionButton action={`/api/academic-years/${y.id}`} method="PATCH" body={{ isCurrent: true }} label="Set as current" testId="set-current-year" />}
        >
          <div className="space-y-3" data-testid="row" data-id={y.id}>
            <Table>
              <THead>
                <TR>
                  <TH>Term</TH>
                  <TH>Start</TH>
                  <TH>End</TH>
                  <TH>Current</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {y.terms.map((t) => (
                  <TR key={t.id} data-testid="term-row" data-id={t.id}>
                    <TD className="font-medium">{t.name}</TD>
                    <TD>{fmtDate(t.startDate)}</TD>
                    <TD>{fmtDate(t.endDate)}</TD>
                    <TD>{t.isCurrent ? <Badge tone="green">Current</Badge> : "—"}</TD>
                    <TD className="text-right">{!t.isCurrent && <ActionButton action={`/api/terms/${t.id}`} method="PATCH" body={{ isCurrent: true }} label="Set as current" testId="set-current-term" />}</TD>
                  </TR>
                ))}
                {y.terms.length === 0 && (
                  <TR>
                    <TD colSpan={5} className="text-center text-slate-500">
                      No terms yet.
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
            <details>
              <summary className="cursor-pointer text-xs text-brand-700 hover:underline">Edit year</summary>
              <div className="mt-3">
                <EntityForm
                  testId={`academic-year-edit-form`}
                  method="PATCH"
                  action={`/api/academic-years/${y.id}`}
                  initial={y as unknown as Record<string, unknown>}
                  columns={3}
                  compact
                  fields={[
                    { name: "name", label: "Name", required: true },
                    { name: "startDate", label: "Start date", type: "date", required: true },
                    { name: "endDate", label: "End date", type: "date", required: true },
                  ]}
                />
              </div>
            </details>
          </div>
        </Card>
      ))}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Create academic year">
          <EntityForm
            testId="academic-year-form"
            action="/api/academic-years"
            submitLabel="Create year"
            resetOnSuccess
            fields={[
              { name: "name", label: "Name", required: true, placeholder: "2026/2027" },
              { name: "isCurrent", label: "Set as current year", type: "checkbox" },
              { name: "startDate", label: "Start date", type: "date", required: true },
              { name: "endDate", label: "End date", type: "date", required: true },
            ]}
          />
        </Card>
        <Card title="Create term">
          <EntityForm
            testId="term-form"
            action="/api/terms"
            submitLabel="Create term"
            resetOnSuccess
            fields={[
              { name: "academicYearId", label: "Academic year", type: "select", options: yearOptions, required: true },
              { name: "name", label: "Name", required: true, placeholder: "Term 1" },
              { name: "startDate", label: "Start date", type: "date", required: true },
              { name: "endDate", label: "End date", type: "date", required: true },
              { name: "isCurrent", label: "Set as current term", type: "checkbox" },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}
