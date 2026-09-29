import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { listRules, workflowCatalog } from "@/modules/workflows";
import { recentJobRuns } from "@/lib/jobs";
import { Alert, Badge, Card, LinkButton, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { fmtDateTime, humanize } from "@/lib/format";
import { ActionButton } from "../_components/action-button";
import { JsonDetails } from "../_components/json-view";
import { guarded, optional } from "../_lib/guard";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
  const user = await requireCurrentUser();
  const res = await guarded(() => listRules(user));
  if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
  const rules = res.data;
  const catalog = workflowCatalog();
  const jobs = await optional(() => recentJobRuns(20), []);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Automation rules"
        description="Database-configured rules: when a trigger fires and the conditions match, the actions run."
        actions={
          <>
            <LinkButton href="/admin/workflows/runs" variant="outline" size="sm">
              Run history
            </LinkButton>
            <ActionButton action="/api/workflows/rules/reset" label="Restore defaults" variant="outline" confirm="Re-install any missing default rules? Existing rules are kept." successMessage="Default rules restored." testId="reset-defaults" />
            <LinkButton href="/admin/workflows/new" size="sm" data-testid="new-rule">
              New rule
            </LinkButton>
          </>
        }
      />
      <Table>
        <THead>
          <TR>
            <TH>Rule</TH>
            <TH>Trigger</TH>
            <TH>Actions</TH>
            <TH>Runs</TH>
            <TH>Active</TH>
            <TH className="text-right">Toggle</TH>
          </TR>
        </THead>
        <TBody>
          {rules.map((r) => {
            const actions = Array.isArray(r.actions) ? (r.actions as Array<{ type?: string }>) : [];
            return (
              <TR key={r.id} data-testid="row" data-id={r.id} data-active={r.isActive ? "true" : "false"}>
                <TD>
                  <Link href={`/admin/workflows/${r.id}`} className="font-medium text-brand-700 hover:underline">
                    {r.name}
                  </Link>
                  {r.description && <div className="max-w-md text-xs text-slate-500">{r.description}</div>}
                </TD>
                <TD>
                  <Badge tone="blue">{humanize(r.trigger)}</Badge>
                </TD>
                <TD className="text-xs">{actions.map((a) => humanize(a.type ?? "?")).join(", ") || "—"}</TD>
                <TD>{r._count.runs}</TD>
                <TD>
                  <StatusBadge status={r.isActive ? "ACTIVE" : "INACTIVE"} />
                </TD>
                <TD className="text-right">
                  <ActionButton action={`/api/workflows/rules/${r.id}`} method="PATCH" body={{ isActive: !r.isActive }} label={r.isActive ? "Disable" : "Enable"} testId="toggle-active" />
                </TD>
              </TR>
            );
          })}
          {rules.length === 0 && (
            <TR>
              <TD colSpan={6} className="text-center text-slate-500">
                No rules. Use “Restore defaults” to install the standard set.
              </TD>
            </TR>
          )}
        </TBody>
      </Table>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Scheduled jobs" description="Reminders, escalations and threshold checks run on a schedule. Trigger them manually here." actions={<ActionButton action="/api/jobs" label="Run scheduled jobs now" variant="primary" showResult testId="run-jobs" />}>
          <Table>
            <THead>
              <TR>
                <TH>Job</TH>
                <TH>Started</TH>
                <TH>Status</TH>
                <TH>Result</TH>
              </TR>
            </THead>
            <TBody>
              {jobs.map((j) => (
                <TR key={j.id} data-testid="job-row" data-id={j.id}>
                  <TD className="font-medium">{j.name}</TD>
                  <TD>{fmtDateTime(j.startedAt)}</TD>
                  <TD>
                    <StatusBadge status={j.status} />
                  </TD>
                  <TD>{j.error ? <span className="text-xs text-red-700">{j.error}</span> : <JsonDetails summary="details" value={j.result} />}</TD>
                </TR>
              ))}
              {jobs.length === 0 && (
                <TR>
                  <TD colSpan={4} className="text-center text-slate-500">
                    No job runs yet.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </Card>
        <Card title="Triggers" description="What each trigger provides to conditions and action templates.">
          <ul className="space-y-2 text-sm">
            {catalog.triggers.map((t) => (
              <li key={t.value}>
                <span className="font-medium">{humanize(t.value)}</span>
                <div className="text-xs text-slate-500">{t.description}</div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
