"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Alert, Button, Checkbox, Field, Input, Select, Textarea } from "@/components/ui";
import { fromLocalInput, toLocalInput } from "@/components/work/datetime";

const TYPES = ["SCHOOL_EVENT", "CLUB", "COMPETITION", "TRIP", "SPORTS", "ASSEMBLY", "PARENT_EVENT", "HOLIDAY", "TRAINING", "EXAM", "OTHER"] as const;
const AUDIENCES = ["SCHOOL", "TEACHERS", "STAFF", "STUDENTS", "PARENTS", "DEPARTMENT", "CLASS"] as const;

export interface EventValues {
  id?: string;
  title: string;
  type: string;
  description: string | null;
  startsAt: Date | string | null;
  endsAt: Date | string | null;
  location: string | null;
  audience: string;
  requiresApproval: boolean;
}

const label = (v: string) => v.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export function EventForm({ initial }: { initial?: EventValues }) {
  const router = useRouter();
  const editing = !!initial?.id;
  const [title, setTitle] = useState(initial?.title ?? "");
  const [type, setType] = useState(initial?.type ?? "SCHOOL_EVENT");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [startsAt, setStartsAt] = useState(toLocalInput(initial?.startsAt));
  const [endsAt, setEndsAt] = useState(toLocalInput(initial?.endsAt));
  const [location, setLocation] = useState(initial?.location ?? "");
  const [audience, setAudience] = useState(initial?.audience ?? "SCHOOL");
  const [requiresApproval, setRequiresApproval] = useState(initial?.requiresApproval ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const json = { title, type, description: description || null, startsAt: fromLocalInput(startsAt), endsAt: fromLocalInput(endsAt), location: location || null, audience, requiresApproval };
    try {
      if (editing) {
        await apiFetch(`/api/events/${initial!.id}`, { method: "PATCH", json });
        router.push(`/events/${initial!.id}`);
      } else {
        const created = await apiFetch<{ id: string }>("/api/events", { method: "POST", json });
        router.push(`/events/${created.id}`);
      }
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} data-testid="event-form" className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Title" htmlFor="title" required>
        <Input id="title" name="title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type" htmlFor="type">
          <Select id="type" name="type" value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {label(t)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Audience" htmlFor="audience">
          <Select id="audience" name="audience" value={audience} onChange={(e) => setAudience(e.target.value)}>
            {AUDIENCES.map((a) => (
              <option key={a} value={a}>
                {a === "SCHOOL" ? "Entire school" : label(a)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Description" htmlFor="description">
        <Textarea id="description" name="description" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Starts" htmlFor="startsAt" required>
          <Input id="startsAt" name="startsAt" type="datetime-local" required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </Field>
        <Field label="Ends" htmlFor="endsAt" required>
          <Input id="endsAt" name="endsAt" type="datetime-local" required value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </Field>
        <Field label="Location" htmlFor="location">
          <Input id="location" name="location" maxLength={200} value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>
      </div>
      <Checkbox name="requiresApproval" checked={requiresApproval} onChange={(e) => setRequiresApproval(e.target.checked)} label="Requires administrator approval before it is scheduled" />
      <div className="flex gap-2">
        <Button type="submit" disabled={busy} data-testid="submit">
          {busy ? "Saving…" : editing ? "Save changes" : "Create event"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
