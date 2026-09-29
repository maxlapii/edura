import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { workflowCatalog } from "@/modules/workflows";
import { Card, PageHeader } from "@/components/ui";
import { humanize } from "@/lib/format";
import { EntityForm } from "../../_components/entity-form";
import { ruleFields } from "../_rule-fields";

export const dynamic = "force-dynamic";

export default async function NewRulePage() {
  await requireCurrentUser();
  const catalog = workflowCatalog();
  const triggers = catalog.triggers.map((t) => ({ value: t.value, label: humanize(t.value) }));
  return (
    <div className="space-y-6">
      <PageHeader
        title="New automation rule"
        breadcrumb={
          <Link href="/admin/workflows" className="hover:underline">
            Automation rules
          </Link>
        }
      />
      <Card>
        <EntityForm
          testId="workflow-rule-form"
          action="/api/workflows/rules"
          submitLabel="Create rule"
          redirectTo="/admin/workflows/{id}"
          cancelHref="/admin/workflows"
          initial={{ trigger: triggers[0]?.value, conditions: {}, actions: [{ type: "SEND_NOTIFICATION", params: { to: "admins", type: "GENERIC", title: "", body: "" } }], isActive: true }}
          fields={ruleFields(triggers)}
        />
      </Card>
      <Card title="Reference">
        <div className="grid gap-4 text-xs sm:grid-cols-2">
          <div>
            <h3 className="mb-1 font-semibold text-slate-700">Actions</h3>
            <ul className="space-y-1">
              {catalog.actions.map((a) => (
                <li key={a.type}>
                  <code className="rounded bg-slate-100 px-1">{a.type}</code> – {a.description} Params: {a.params.join(", ")}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-1 font-semibold text-slate-700">Conditions</h3>
            <p>
              Operators: {catalog.operators.join(", ")}. Recipients: {catalog.recipientSpecs.join(", ")}. Templates may reference payload fields with {"{{field}}"}.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
