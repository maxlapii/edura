import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { listRuns, workflowCatalog } from "@/modules/workflows";
import type { WorkflowTrigger } from "@/generated/prisma/enums";
import { Alert, Badge, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { fmtDateTime, humanize } from "@/lib/format";
import { FilterBar, FilterField, FilterSelect } from "../../_components/filter-bar";
import { JsonDetails } from "../../_components/json-view";
import { guarded, str } from "../../_lib/guard";
import type { PageProps } from "../../_lib/types";

export const dynamic = "force-dynamic";

export default async function WorkflowRunsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const user = await requireCurrentUser();
  const trigger = str(sp, "trigger") as WorkflowTrigger | undefined;
  const status = str(sp, "status") as "SUCCESS" | "SKIPPED" | "FAILED" | undefined;
  const res = await guarded(() => listRuns(user, { trigger, status }));
  if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
  const runs = res.data;
  const triggers = workflowCatalog().triggers.map((t) => ({ value: t.value, label: humanize(t.value) }));
  return (
    <div className="space-y-4">
      <PageHeader
        title="Automation run history"
        description={`${runs.length} most recent runs`}
        breadcrumb={
          <Link href="/admin/workflows" className="hover:underline">
            Automation rules
          </Link>
        }
      />
      <FilterBar action="/admin/workflows/runs">
        <FilterField label="Trigger">
          <FilterSelect name="trigger" defaultValue={trigger ?? ""} options={triggers} />
        </FilterField>
        <FilterField label="Status">
          <FilterSelect name="status" defaultValue={status ?? ""} options={[{ value: "SUCCESS", label: "Success" }, { value: "SKIPPED", label: "Skipped" }, { value: "FAILED", label: "Failed" }]} />
        </FilterField>
      </FilterBar>
      <Table>
        <THead>
          <TR>
            <TH>When</TH>
            <TH>Trigger</TH>
            <TH>Rule</TH>
            <TH>Status</TH>
            <TH>Payload</TH>
            <TH>Result</TH>
          </TR>
        </THead>
        <TBody>
          {runs.map((r) => (
            <TR key={r.id} data-testid="row" data-id={r.id}>
              <TD>{fmtDateTime(r.createdAt)}</TD>
              <TD>
                <Badge tone="blue">{humanize(r.trigger)}</Badge>
              </TD>
              <TD>{r.rule ? <Link href={`/admin/workflows/${r.rule.id}`} className="text-brand-700 hover:underline">{r.rule.name}</Link> : <span className="text-slate-400">deleted</span>}</TD>
              <TD>
                <StatusBadge status={r.status === "SUCCESS" ? "COMPLETED" : r.status === "FAILED" ? "REJECTED" : "CANCELLED"} />
                <span className="ml-1 text-xs text-slate-500">{humanize(r.status)}</span>
              </TD>
              <TD>
                <JsonDetails summary="payload" value={r.payload} />
              </TD>
              <TD>{r.error ? <span className="text-xs text-red-700">{r.error}</span> : <JsonDetails summary="result" value={r.result} />}</TD>
            </TR>
          ))}
          {runs.length === 0 && (
            <TR>
              <TD colSpan={6} className="text-center text-slate-500">
                No runs yet.
              </TD>
            </TR>
          )}
        </TBody>
      </Table>
    </div>
  );
}
