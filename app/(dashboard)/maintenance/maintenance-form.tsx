"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";

const CATEGORIES = ["PROJECTOR", "AIR_CONDITIONING", "COMPUTER", "FURNITURE", "ROOM", "CLEANING", "OTHER"] as const;
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
const label = (v: string) => v.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export function MaintenanceForm({ rooms, defaultRoomId }: { rooms: Array<{ id: string; name: string; code: string }>; defaultRoomId?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(!!defaultRoomId);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("OTHER");
  const [description, setDescription] = useState("");
  const [roomId, setRoomId] = useState(defaultRoomId ?? "");
  const [priority, setPriority] = useState<string>("NORMAL");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await apiFetch<{ id: string }>("/api/maintenance", { method: "POST", json: { title, category, description: description || null, roomId: roomId || null, priority } });
      router.push(`/maintenance/${created.id}`);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} data-testid="report-issue">
        Report issue
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} data-testid="maintenance-form" className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="What is the problem?" htmlFor="m-title" required>
        <Input id="m-title" name="title" required maxLength={200} placeholder="e.g. Projector in Room 12 does not turn on" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Category" htmlFor="m-category">
          <Select id="m-category" name="category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {label(c)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Room" htmlFor="m-room">
          <Select id="m-room" name="roomId" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">Not room specific</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.code})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Priority" htmlFor="m-priority">
          <Select id="m-priority" name="priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {label(p)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Details" htmlFor="m-description">
        <Textarea id="m-description" name="description" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy} data-testid="submit">
          {busy ? "Submitting…" : "Submit request"}
        </Button>
        <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
