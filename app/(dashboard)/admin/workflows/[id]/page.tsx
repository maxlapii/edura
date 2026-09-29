import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { getRule, workflowCatalog } from "@/modules/workflows";
import { Alert, Card, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { fmtDateTime, humanize } from "@/lib/format";
import { ActionButton } from "../../_components/action-button";
import { EntityForm } from "../../_components/entity-form";
import { JsonDetails } from "../../_components/json-view";
import { guarded } from "../../_lib/guard";
import type { PageProps } from "../../_lib/types";
import { ruleFields } from "../_rule-fields";
import { TestRuleForm } from "../test-rule-form";

export const dynamic = "force-dynamic";

/** Builds a sample payload from the trigger description "(field, field, …)". */
function samplePayload(description: string): string {
  const m = description.match(/\(([^)]*)\)/);
  const fields = m ? m[1].split(",").map((s) => s.trim()).filter(Boolean) : [];
  return JSON.stringify(Object.fromEntries(fields.map((f) => [f, f.endsWith("Ids") ? [] : f.endsWith("Count") || f.startsWith("days") || f === "days" ? 1 : ""])), null, 2);
}

export default async function RuleEditorPage({ params }: PageProps<{ id: string }>) {
  const { id } = await params;
  const user = await requireCurrentUser();
  const res = await guarded(() => getRule(user, id));
  if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
  const rule = res.data;
  const catalog = workflowCatalog();
  const triggers = catalog.triggers.map((t) => ({ value: t.value, label: humanize(t.value) }));
  const trigger = catalog.triggers.find((t) => t.value === rule.trigger);
  return (
    <div className="space-y-6">
      <PageHeader
        title={rule.name}
        description={trigger?.description}
        breadcrumb={
          <Link href="/admin/workflows" className="hover:underline">
            Automation rules
          </Link>
        }
        actions={
          <>
            <StatusBadge status={rule.isActive ? "ACTIVE" : "INACTIVE"} />
            <ActionButton action={`/api/workflows/rules/${rule.id}`} method="DELETE" label="Delete rule" variant="danger" confirm={`Delete rule "${rule.name}"?`} redirectTo="/admin/workflows" testId="delete" />
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Rule">
            <EntityForm testId="workflow-rule-form" method="PATCH" action={`/api/workflows/rules/${rule.id}`} initial={rule as unknown as Record<string, unknown>} fields={ruleFields(triggers)} />
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Test rule">
            <TestRuleForm ruleId={rule.id} samplePayload={samplePayload(trigger?.description ?? "")} />
          </Card>
          <Card title="Action reference">
            <ul className="space-y-1 text-xs">
              {catalog.actions.map((a) => (
                <li key={a.type}>
                  <code className="rounded bg-slate-100 px-1">{a.type}</code>: {a.params.join(", ")}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-500">Operators: {catalog.operators.join(", ")}. Recipients: {catalog.recipientSpecs.join(", ")}.</p>
          </Card>
        </div>
      </div>
      <Card title="Recent runs" padded={false}>
        <Table className="rounded-none border-0">
          <THead>
            <TR>
              <TH>When</TH>
              <TH>Status</TH>
              <TH>Payload</TH>
              <TH>Result</TH>
            </TR>
          </THead>
          <TBody>
            {rule.recentRuns.map((r) => (
              <TR key={r.id} data-testid="run-row" data-id={r.id}>
                <TD>{fmtDateTime(r.createdAt)}</TD>
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
            {rule.recentRuns.length === 0 && (
              <TR>
                <TD colSpan={4} className="text-center text-slate-500">
                  This rule has not run yet.
                </TD>
              </TR>
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
