import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { listTemplates } from "@/modules/communication";
import { Alert, Card, EmptyState, PageHeader } from "@/components/ui";
import { load } from "@/components/work/guard";
import { TemplateEditor, TemplateRow } from "./template-editor";

export const dynamic = "force-dynamic";

export default async function MessageTemplatesPage() {
  const user = await requireCurrentUser();
  const result = await load(() => listTemplates(user));
  const templates = result.data ?? [];
  return (
    <div className="space-y-6">
      <PageHeader title="Message templates" breadcrumb={<Link href="/messages" className="hover:underline">← Messages</Link>} description="Reusable messages for parents and students. Placeholders are filled in when a student is selected." />
      {result.error && <Alert tone="error">{result.error}</Alert>}
      {!result.error && (
        <>
          <Card title="New template">
            <TemplateEditor />
          </Card>
          <Card title={`Templates (${templates.length})`} padded={false}>
            {templates.length === 0 ? (
              <div className="p-4">
                <EmptyState title="No templates yet" description="Create your first template above." />
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {templates.map((t) => (
                  <TemplateRow key={t.id} template={t} />
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
