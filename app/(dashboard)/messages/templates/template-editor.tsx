"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Alert, Button, Field, Input, Textarea } from "@/components/ui";

export interface TemplateValues {
  id?: string;
  name: string;
  category: string;
  subject: string;
  body: string;
}

export function TemplateEditor({ initial, onDone }: { initial?: TemplateValues; onDone?: () => void }) {
  const router = useRouter();
  const editing = !!initial?.id;
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "GENERAL");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editing) await apiFetch(`/api/message-templates/${initial!.id}`, { method: "PATCH", json: { name, category, subject, body } });
      else await apiFetch("/api/message-templates", { method: "POST", json: { name, category, subject, body } });
      if (!editing) {
        setName("");
        setSubject("");
        setBody("");
      }
      onDone?.();
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} data-testid="template-form" className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor={`tpl-name-${initial?.id ?? "new"}`} required>
          <Input id={`tpl-name-${initial?.id ?? "new"}`} name="name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Category" htmlFor={`tpl-cat-${initial?.id ?? "new"}`}>
          <Input id={`tpl-cat-${initial?.id ?? "new"}`} name="category" maxLength={40} value={category} onChange={(e) => setCategory(e.target.value.toUpperCase())} />
        </Field>
      </div>
      <Field label="Subject" htmlFor={`tpl-subject-${initial?.id ?? "new"}`} required>
        <Input id={`tpl-subject-${initial?.id ?? "new"}`} name="subject" required maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} />
      </Field>
      <Field label="Body" htmlFor={`tpl-body-${initial?.id ?? "new"}`} required hint="Placeholders: {{studentName}}, {{className}}, {{teacherName}}, {{date}}">
        <Textarea id={`tpl-body-${initial?.id ?? "new"}`} name="body" required value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy} data-testid="submit">
          {busy ? "Saving…" : editing ? "Save template" : "Create template"}
        </Button>
        {onDone && (
          <Button type="button" variant="outline" onClick={onDone} disabled={busy}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

/** Row that toggles between a read-only summary and the editor. */
export function TemplateRow({ template }: { template: TemplateValues & { id: string; variables: string[] } }) {
  const [editing, setEditing] = useState(false);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm(`Delete template "${template.name}"?`)) return;
    try {
      await apiFetch(`/api/message-templates/${template.id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <li className="px-4 py-3" data-testid="row" data-id={template.id}>
      {editing ? (
        <TemplateEditor initial={template} onDone={() => setEditing(false)} />
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-900">
              {template.name} <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-600">{template.category}</span>
            </div>
            <div className="text-xs text-slate-500">{template.subject}</div>
            <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-slate-600">{template.body}</p>
            {template.variables.length > 0 && <p className="mt-1 text-[11px] text-slate-400">Uses: {template.variables.join(", ")}</p>}
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          </div>
          <div className="flex shrink-0 gap-1">
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)} data-testid="edit">
              Edit
            </Button>
            <Button variant="ghost" size="sm" onClick={remove} data-testid="delete" className="text-red-700">
              Delete
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
