"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";

interface Option {
  id: string;
  name: string;
}
interface Template {
  id: string;
  name: string;
  category: string;
  subject: string;
  body: string;
}

const AUDIENCES = ["TEACHERS", "STAFF", "PARENTS", "STUDENTS"] as const;

export function MessageForm({ users, classes, departments, canPickAudience, canUseTemplates, prefill }: {
  users: Array<Option & { role?: string }>;
  classes?: Option[];
  departments?: Option[];
  canPickAudience: boolean;
  canUseTemplates: boolean;
  prefill: { to?: string[]; classId?: string; threadId?: string; subject?: string; studentId?: string };
}) {
  const router = useRouter();
  const [subject, setSubject] = useState(prefill.subject ?? "");
  const [body, setBody] = useState("");
  const [userIds, setUserIds] = useState<string[]>(prefill.to ?? []);
  const [classId, setClassId] = useState(prefill.classId ?? "");
  const [departmentId, setDepartmentId] = useState("");
  const [audience, setAudience] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canUseTemplates) return;
    let cancelled = false;
    apiFetch<Template[]>("/api/message-templates")
      .then((list) => {
        if (!cancelled) setTemplates(list);
      })
      .catch(() => {
        /* templates are optional */
      });
    return () => {
      cancelled = true;
    };
  }, [canUseTemplates]);

  async function applyTemplate(id: string) {
    setTemplateId(id);
    if (!id) return;
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    if (prefill.studentId) {
      try {
        const rendered = await apiFetch<{ subject: string; body: string }>(`/api/message-templates/${id}/render?studentId=${encodeURIComponent(prefill.studentId)}`);
        setSubject(rendered.subject);
        setBody(rendered.body);
        return;
      } catch (err) {
        setError(errorMessage(err));
      }
    }
    setSubject(t.subject);
    setBody(t.body);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const recipients: Record<string, unknown> = {};
    if (userIds.length) recipients.userIds = userIds;
    if (classId) recipients.classId = classId;
    if (departmentId) recipients.departmentId = departmentId;
    if (audience) recipients.audience = audience;
    try {
      const created = await apiFetch<{ id: string }>("/api/messages", { method: "POST", json: { subject, body, recipients, threadId: prefill.threadId ?? null } });
      router.push(`/messages/${created.id}`);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  const recipientCount = userIds.length + (classId ? 1 : 0) + (departmentId ? 1 : 0) + (audience ? 1 : 0);

  return (
    <form onSubmit={onSubmit} data-testid="message-form" className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {prefill.threadId && <Alert tone="info">This message will be sent as a reply in the existing thread.</Alert>}

      {canUseTemplates && templates.length > 0 && (
        <Field label="Template" htmlFor="templateId" hint={prefill.studentId ? "Placeholders are filled in for the selected student." : "Fills the subject and body; you can edit them afterwards."}>
          <Select id="templateId" name="templateId" value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
            <option value="">— No template —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.category} · {t.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="Recipients" htmlFor="userIds" hint={`${userIds.length} selected · hold Ctrl/Cmd to select several`} required={recipientCount === 0}>
        <Select id="userIds" name="userIds" multiple size={8} value={userIds} onChange={(e) => setUserIds(Array.from(e.target.selectedOptions, (o) => o.value))}>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
              {u.role ? ` · ${u.role.replace(/_/g, " ").toLowerCase()}` : ""}
            </option>
          ))}
        </Select>
      </Field>

      {(classes || departments || canPickAudience) && (
        <div className="grid gap-4 sm:grid-cols-3">
          {classes && (
            <Field label="Whole class" htmlFor="classId" hint="Students and their guardians">
              <Select id="classId" name="classId" value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="">—</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {departments && (
            <Field label="Department" htmlFor="departmentId" hint="All teachers of the department">
              <Select id="departmentId" name="departmentId" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">—</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {canPickAudience && (
            <Field label="Audience" htmlFor="audience" hint="Everyone in the group">
              <Select id="audience" name="audience" value={audience} onChange={(e) => setAudience(e.target.value)}>
                <option value="">—</option>
                {AUDIENCES.map((a) => (
                  <option key={a} value={a}>
                    All {a.toLowerCase()}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      )}

      <Field label="Subject" htmlFor="subject" required>
        <Input id="subject" name="subject" required maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} />
      </Field>
      <Field label="Message" htmlFor="body" required>
        <Textarea id="body" name="body" required className="min-h-[180px]" value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || recipientCount === 0} data-testid="submit">
          {busy ? "Sending…" : "Send message"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
