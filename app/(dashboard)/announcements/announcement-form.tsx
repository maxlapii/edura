"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { fromLocalInput, toLocalInput } from "@/components/work/datetime";

const AUDIENCES = ["SCHOOL", "TEACHERS", "STAFF", "STUDENTS", "PARENTS", "DEPARTMENT", "CLASS"] as const;
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

export interface AnnouncementValues {
  id?: string;
  title: string;
  body: string;
  audience: string;
  targetId: string | null;
  priority: string;
  publishAt: Date | string | null;
  expiresAt: Date | string | null;
}

export function AnnouncementForm({ initial, departments, classes, allowedAudiences }: {
  initial?: AnnouncementValues;
  departments: Array<{ id: string; name: string }>;
  classes: Array<{ id: string; name: string }>;
  /** Department heads may only target their own department. */
  allowedAudiences?: readonly string[];
}) {
  const router = useRouter();
  const editing = !!initial?.id;
  const audiences = allowedAudiences ?? AUDIENCES;
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [audience, setAudience] = useState(initial?.audience ?? audiences[0]);
  const [targetId, setTargetId] = useState(initial?.targetId ?? "");
  const [priority, setPriority] = useState(initial?.priority ?? "NORMAL");
  const [publishAt, setPublishAt] = useState(toLocalInput(initial?.publishAt));
  const [expiresAt, setExpiresAt] = useState(toLocalInput(initial?.expiresAt));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsTarget = audience === "DEPARTMENT" || audience === "CLASS";
  const targets = audience === "DEPARTMENT" ? departments : audience === "CLASS" ? classes : [];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const json = {
      title,
      body,
      audience,
      targetId: needsTarget ? targetId || null : null,
      priority,
      ...(publishAt ? { publishAt: fromLocalInput(publishAt) } : {}),
      expiresAt: fromLocalInput(expiresAt),
    };
    try {
      if (editing) {
        await apiFetch(`/api/announcements/${initial!.id}`, { method: "PATCH", json });
        router.push(`/announcements/${initial!.id}`);
      } else {
        const created = await apiFetch<{ id: string }>("/api/announcements", { method: "POST", json });
        router.push(`/announcements/${created.id}`);
      }
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} data-testid="announcement-form" className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Title" htmlFor="title" required>
        <Input id="title" name="title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Body" htmlFor="body" required>
        <Textarea id="body" name="body" required className="min-h-[160px]" value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Audience" htmlFor="audience">
          <Select
            id="audience"
            name="audience"
            value={audience}
            onChange={(e) => {
              setAudience(e.target.value);
              setTargetId("");
            }}
          >
            {audiences.map((a) => (
              <option key={a} value={a}>
                {a === "SCHOOL" ? "Entire school" : a.charAt(0) + a.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>
        {needsTarget && (
          <Field label={audience === "DEPARTMENT" ? "Department" : "Class"} htmlFor="targetId" required>
            <Select id="targetId" name="targetId" required value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">Select…</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Priority" htmlFor="priority">
          <Select id="priority" name="priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p.charAt(0) + p.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Publish at" htmlFor="publishAt" hint="Leave empty to publish immediately.">
          <Input id="publishAt" name="publishAt" type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} />
        </Field>
        <Field label="Expires at" htmlFor="expiresAt" hint="Optional. Hidden from readers after this time.">
          <Input id="expiresAt" name="expiresAt" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy} data-testid="submit">
          {busy ? "Saving…" : editing ? "Save changes" : "Publish announcement"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
